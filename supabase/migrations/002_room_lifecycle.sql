-- Lobby lifecycle: purge expired rooms and allow host to end a session.

create or replace function public.purge_expired_rooms()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  with removed as (
    delete from public.rooms
    where expires_at <= now()
    returning id
  )
  select count(*)::int into v_deleted from removed;

  return coalesce(v_deleted, 0);
end;
$$;

create or replace function public.end_room(p_room_id uuid, p_host_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  if p_room_id is null or p_host_token is null or length(trim(p_host_token)) = 0 then
    return false;
  end if;

  with removed as (
    delete from public.rooms
    where id = p_room_id
      and host_token = p_host_token
    returning id
  )
  select count(*)::int into v_deleted from removed;

  return coalesce(v_deleted, 0) > 0;
end;
$$;

-- Drop and recreate create_room to purge stale lobbies first.
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

  return json_build_object(
    'room_id', v_room_id,
    'code', v_code,
    'host_token', v_host_token
  );
end;
$$;

grant execute on function public.purge_expired_rooms() to anon, authenticated;
grant execute on function public.end_room(uuid, text) to anon, authenticated;
