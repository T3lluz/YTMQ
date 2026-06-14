-- Host session controls: live participants/presence, kick, lock, optional
-- join password, and guest permission toggles.
--
-- Threat model note: guests and the YT Music bridge both use the anon key, so
-- "add to queue" is enforced in RLS (the bridge never inserts) while "remove"
-- and "playback controls" are gated in the UI (the bridge needs delete access
-- and controls travel over a broadcast channel). Lock / password / kick are
-- enforced server-side in SECURITY DEFINER RPCs.

-- ---------------------------------------------------------------------------
-- rooms: optional bcrypt password (never exposed to clients)
-- ---------------------------------------------------------------------------
alter table public.rooms
  add column if not exists password_hash text;

-- ---------------------------------------------------------------------------
-- room_settings: client-safe, realtime-broadcastable room configuration
-- ---------------------------------------------------------------------------
create table if not exists public.room_settings (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  locked boolean not null default false,
  has_password boolean not null default false,
  allow_guest_add boolean not null default true,
  allow_guest_remove boolean not null default true,
  allow_guest_controls boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Backfill settings for any pre-existing rooms.
insert into public.room_settings (room_id)
  select id from public.rooms
  on conflict (room_id) do nothing;

-- ---------------------------------------------------------------------------
-- participants: stable per-device id + kick flag
-- ---------------------------------------------------------------------------
alter table public.participants
  add column if not exists client_id text not null default '',
  add column if not exists kicked boolean not null default false;

-- Swap the (room_id, nickname) uniqueness for (room_id, client_id): identity
-- is now the device, so duplicate nicknames are allowed and a participant is
-- tracked across reloads.
alter table public.participants
  drop constraint if exists participants_room_id_nickname_key;

create unique index if not exists participants_room_client_idx
  on public.participants (room_id, client_id);

-- ---------------------------------------------------------------------------
-- room_settings RLS: clients read only; all writes go through RPCs.
-- ---------------------------------------------------------------------------
alter table public.room_settings enable row level security;

drop policy if exists "room_settings_select" on public.room_settings;
create policy "room_settings_select"
  on public.room_settings
  for select
  to anon, authenticated
  using (public.room_is_active(room_id));

-- ---------------------------------------------------------------------------
-- participants: lock direct writes; route them through touch/kick/leave RPCs
-- so a kicked client cannot un-kick itself. Reads stay open.
-- ---------------------------------------------------------------------------
drop policy if exists "participants_insert" on public.participants;
drop policy if exists "participants_update" on public.participants;
drop policy if exists "participants_delete" on public.participants;

-- ---------------------------------------------------------------------------
-- Permission helper used by the queue_items insert policy.
-- ---------------------------------------------------------------------------
create or replace function public.room_allows_add(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.room_is_active(p_room_id)
     and coalesce(
       (select allow_guest_add from public.room_settings where room_id = p_room_id),
       true
     );
$$;

drop policy if exists "queue_items_insert" on public.queue_items;
create policy "queue_items_insert"
  on public.queue_items
  for insert
  to anon, authenticated
  with check (public.room_allows_add(room_id));

-- ---------------------------------------------------------------------------
-- create_room: also seed default settings.
-- ---------------------------------------------------------------------------
create or replace function public.create_room()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid := gen_random_uuid();
  v_code text;
  v_host_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  perform public.purge_expired_rooms();

  v_code := public.generate_room_code();

  insert into public.rooms (id, code, host_token)
  values (v_room_id, v_code, v_host_token);

  insert into public.room_settings (room_id) values (v_room_id);

  return json_build_object(
    'room_id', v_room_id,
    'code', v_code,
    'host_token', v_host_token
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- get_room: include client-safe settings so the UI can gate on load.
-- ---------------------------------------------------------------------------
create or replace function public.get_room(p_room_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_s public.room_settings%rowtype;
begin
  select * into v_room
  from public.rooms
  where id = p_room_id and expires_at > now()
  limit 1;

  if not found then
    return null;
  end if;

  select * into v_s from public.room_settings where room_id = p_room_id;

  return json_build_object(
    'room_id', v_room.id,
    'code', v_room.code,
    'created_at', v_room.created_at,
    'expires_at', v_room.expires_at,
    'locked', coalesce(v_s.locked, false),
    'has_password', coalesce(v_s.has_password, false),
    'allow_guest_add', coalesce(v_s.allow_guest_add, true),
    'allow_guest_remove', coalesce(v_s.allow_guest_remove, true),
    'allow_guest_controls', coalesce(v_s.allow_guest_controls, true)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- join_room (by code): enforce lock + password.
-- Returns {room_id, code} | {error: 'locked'|'password'} | null (not found).
-- ---------------------------------------------------------------------------
drop function if exists public.join_room(text);

create or replace function public.join_room(p_code text, p_password text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
  v_s public.room_settings%rowtype;
begin
  if p_code is null or length(trim(p_code)) = 0 then
    return null;
  end if;

  select * into v_room
  from public.rooms
  where upper(code) = upper(trim(p_code)) and expires_at > now()
  limit 1;

  if not found then
    return null;
  end if;

  select * into v_s from public.room_settings where room_id = v_room.id;

  if coalesce(v_s.locked, false) then
    return json_build_object('error', 'locked');
  end if;

  if v_room.password_hash is not null then
    if p_password is null
       or extensions.crypt(p_password, v_room.password_hash) <> v_room.password_hash then
      return json_build_object('error', 'password');
    end if;
  end if;

  return json_build_object('room_id', v_room.id, 'code', v_room.code);
end;
$$;

-- ---------------------------------------------------------------------------
-- verify_room_password: gate direct-link access on the Room page.
-- ---------------------------------------------------------------------------
create or replace function public.verify_room_password(p_room_id uuid, p_password text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
begin
  select password_hash into v_hash
  from public.rooms
  where id = p_room_id and expires_at > now();

  if not found then
    return false;
  end if;
  if v_hash is null then
    return true;
  end if;
  if p_password is null then
    return false;
  end if;

  return extensions.crypt(p_password, v_hash) = v_hash;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_room_settings: host toggles lock + guest permissions.
-- ---------------------------------------------------------------------------
create or replace function public.set_room_settings(
  p_room_id uuid,
  p_host_token text,
  p_locked boolean,
  p_allow_guest_add boolean,
  p_allow_guest_remove boolean,
  p_allow_guest_controls boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.verify_host_token(p_room_id, p_host_token) then
    return false;
  end if;

  update public.room_settings set
    locked = coalesce(p_locked, locked),
    allow_guest_add = coalesce(p_allow_guest_add, allow_guest_add),
    allow_guest_remove = coalesce(p_allow_guest_remove, allow_guest_remove),
    allow_guest_controls = coalesce(p_allow_guest_controls, allow_guest_controls),
    updated_at = now()
  where room_id = p_room_id;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_room_password: host sets ('' or null clears) the join password.
-- ---------------------------------------------------------------------------
create or replace function public.set_room_password(
  p_room_id uuid,
  p_host_token text,
  p_password text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean text;
begin
  if not public.verify_host_token(p_room_id, p_host_token) then
    return false;
  end if;

  v_clean := nullif(trim(coalesce(p_password, '')), '');

  if v_clean is null then
    update public.rooms set password_hash = null where id = p_room_id;
    update public.room_settings
      set has_password = false, updated_at = now()
      where room_id = p_room_id;
  else
    update public.rooms
      set password_hash = extensions.crypt(v_clean, extensions.gen_salt('bf'))
      where id = p_room_id;
    update public.room_settings
      set has_password = true, updated_at = now()
      where room_id = p_room_id;
  end if;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- touch_participant: join/heartbeat. Enforces lock (new joiners) + kick.
-- Returns 'ok' | 'kicked' | 'locked' | 'inactive'.
-- ---------------------------------------------------------------------------
create or replace function public.touch_participant(
  p_room_id uuid,
  p_client_id text,
  p_nickname text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.participants%rowtype;
  v_locked boolean;
begin
  if not public.room_is_active(p_room_id) then
    return 'inactive';
  end if;
  if p_client_id is null or length(trim(p_client_id)) = 0 then
    return 'inactive';
  end if;

  select * into v_existing
  from public.participants
  where room_id = p_room_id and client_id = p_client_id;

  if found and v_existing.kicked then
    return 'kicked';
  end if;

  if not found then
    select locked into v_locked from public.room_settings where room_id = p_room_id;
    if coalesce(v_locked, false) then
      return 'locked';
    end if;
    insert into public.participants (room_id, client_id, nickname, last_seen)
    values (p_room_id, p_client_id, coalesce(p_nickname, ''), now());
  else
    update public.participants
      set nickname = coalesce(p_nickname, nickname), last_seen = now()
      where id = v_existing.id;
  end if;

  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- kick_participant: host removes a participant and blocks rejoin.
-- ---------------------------------------------------------------------------
create or replace function public.kick_participant(
  p_room_id uuid,
  p_host_token text,
  p_client_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.verify_host_token(p_room_id, p_host_token) then
    return false;
  end if;

  update public.participants
    set kicked = true, last_seen = now()
    where room_id = p_room_id and client_id = p_client_id;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- leave_participant: best-effort cleanup when a guest leaves (kept rows that
-- were kicked stay so they cannot silently rejoin).
-- ---------------------------------------------------------------------------
create or replace function public.leave_participant(
  p_room_id uuid,
  p_client_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.participants
    where room_id = p_room_id and client_id = p_client_id and kicked = false;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Realtime: stream participants + room_settings (neither carries secrets).
-- ---------------------------------------------------------------------------
alter table public.participants replica identity full;
alter table public.room_settings replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'participants'
  ) then
    alter publication supabase_realtime add table public.participants;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'room_settings'
  ) then
    alter publication supabase_realtime add table public.room_settings;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select on public.room_settings to anon, authenticated;

grant execute on function public.room_allows_add(uuid) to anon, authenticated;
grant execute on function public.create_room() to anon, authenticated;
grant execute on function public.get_room(uuid) to anon, authenticated;
grant execute on function public.join_room(text, text) to anon, authenticated;
grant execute on function public.verify_room_password(uuid, text) to anon, authenticated;
grant execute on function public.set_room_settings(uuid, text, boolean, boolean, boolean, boolean) to anon, authenticated;
grant execute on function public.set_room_password(uuid, text, text) to anon, authenticated;
grant execute on function public.touch_participant(uuid, text, text) to anon, authenticated;
grant execute on function public.kick_participant(uuid, text, text) to anon, authenticated;
grant execute on function public.leave_participant(uuid, text) to anon, authenticated;
