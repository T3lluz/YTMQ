-- Allow the host to kick everyone using a given display name (case-insensitive).
-- Complements kick_participant (which targets a single device by client_id).

create or replace function public.kick_by_nickname(
  p_room_id uuid,
  p_host_token text,
  p_nickname text
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if not public.verify_host_token(p_room_id, p_host_token) then
    return 0;
  end if;

  if trim(coalesce(p_nickname, '')) = '' then
    return 0;
  end if;

  with upd as (
    update public.participants
      set kicked = true, last_seen = now()
      where room_id = p_room_id
        and lower(trim(nickname)) = lower(trim(p_nickname))
      returning 1
  )
  select count(*)::int into v_count from upd;

  return coalesce(v_count, 0);
end;
$$;

grant execute on function public.kick_by_nickname(uuid, text, text) to anon, authenticated;
