-- Track whether a queued track was added as "Play next" or "Add to queue"
-- so the YT Music bridge can mirror the right insertion semantics and the
-- guest UI can label each row.

alter table public.queue_items
  add column if not exists insert_mode text not null default 'play_next';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'queue_items_insert_mode_check'
  ) then
    alter table public.queue_items
      add constraint queue_items_insert_mode_check
      check (insert_mode in ('play_next', 'queue'));
  end if;
end
$$;
