-- YTMQ initial schema: rooms, queue_items, RLS, Realtime, lobby RPCs

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_token text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index rooms_code_idx on public.rooms (upper(code));

create table public.queue_items (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  position int not null,
  video_id text not null,
  title text not null,
  channel_title text not null default '',
  thumbnail_url text not null default '',
  added_by text not null default '',
  created_at timestamptz not null default now(),
  unique (room_id, position)
);

create index queue_items_room_position_idx on public.queue_items (room_id, position);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  nickname text not null default '',
  last_seen timestamptz not null default now(),
  unique (room_id, nickname)
);

create index participants_room_id_idx on public.participants (room_id);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.room_is_active(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.rooms r
    where r.id = p_room_id
      and r.expires_at > now()
  );
$$;

create or replace function public.generate_room_code()
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_code text;
  v_attempts int := 0;
begin
  loop
    v_attempts := v_attempts + 1;
    if v_attempts > 50 then
      raise exception 'Could not generate unique room code';
    end if;

    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

    exit when not exists (select 1 from public.rooms where code = v_code);
  end loop;

  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs (SECURITY DEFINER — rooms not readable directly by clients)
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
  v_code := public.generate_room_code();

  insert into public.rooms (id, code, host_token)
  values (v_room_id, v_code, v_host_token);

  return json_build_object(
    'room_id', v_room_id,
    'code', v_code,
    'host_token', v_host_token
  );
end;
$$;

create or replace function public.join_room(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
begin
  if p_code is null or length(trim(p_code)) = 0 then
    return null;
  end if;

  select *
  into v_room
  from public.rooms
  where upper(code) = upper(trim(p_code))
    and expires_at > now()
  limit 1;

  if not found then
    return null;
  end if;

  return json_build_object(
    'room_id', v_room.id,
    'code', v_room.code
  );
end;
$$;

create or replace function public.get_room(p_room_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.rooms%rowtype;
begin
  select *
  into v_room
  from public.rooms
  where id = p_room_id
    and expires_at > now()
  limit 1;

  if not found then
    return null;
  end if;

  return json_build_object(
    'room_id', v_room.id,
    'code', v_room.code,
    'created_at', v_room.created_at,
    'expires_at', v_room.expires_at
  );
end;
$$;

create or replace function public.verify_host_token(p_room_id uuid, p_host_token text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.rooms r
    where r.id = p_room_id
      and r.host_token = p_host_token
      and r.expires_at > now()
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.rooms enable row level security;
alter table public.queue_items enable row level security;
alter table public.participants enable row level security;

-- rooms: no anon policies — access only via SECURITY DEFINER RPCs

create policy "queue_items_select"
  on public.queue_items
  for select
  to anon, authenticated
  using (public.room_is_active(room_id));

create policy "queue_items_insert"
  on public.queue_items
  for insert
  to anon, authenticated
  with check (public.room_is_active(room_id));

create policy "queue_items_update"
  on public.queue_items
  for update
  to anon, authenticated
  using (public.room_is_active(room_id))
  with check (public.room_is_active(room_id));

create policy "queue_items_delete"
  on public.queue_items
  for delete
  to anon, authenticated
  using (public.room_is_active(room_id));

create policy "participants_select"
  on public.participants
  for select
  to anon, authenticated
  using (public.room_is_active(room_id));

create policy "participants_insert"
  on public.participants
  for insert
  to anon, authenticated
  with check (public.room_is_active(room_id));

create policy "participants_update"
  on public.participants
  for update
  to anon, authenticated
  using (public.room_is_active(room_id))
  with check (public.room_is_active(room_id));

create policy "participants_delete"
  on public.participants
  for delete
  to anon, authenticated
  using (public.room_is_active(room_id));

-- Prevent moving rows between rooms (RLS cannot compare OLD/NEW reliably)
create or replace function public.prevent_room_id_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.room_id is distinct from old.room_id then
    raise exception 'Cannot move rows between rooms';
  end if;
  return new;
end;
$$;

create trigger queue_items_room_id_immutable
  before update on public.queue_items
  for each row
  execute function public.prevent_room_id_change();

create trigger participants_room_id_immutable
  before update on public.participants
  for each row
  execute function public.prevent_room_id_change();

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter table public.queue_items replica identity full;

alter publication supabase_realtime add table public.queue_items;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on public.queue_items to anon, authenticated;
grant select, insert, update, delete on public.participants to anon, authenticated;

grant execute on function public.create_room() to anon, authenticated;
grant execute on function public.join_room(text) to anon, authenticated;
grant execute on function public.get_room(uuid) to anon, authenticated;
grant execute on function public.verify_host_token(uuid, text) to anon, authenticated;
grant execute on function public.room_is_active(uuid) to anon, authenticated;
