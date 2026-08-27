-- ============================================================================
-- Fix: "UPDATE requires a WHERE clause" when accepting ownership
-- ============================================================================
-- Supabase loads pg_safeupdate on the API roles, so a statement that touches
-- a whole table with no qualification is refused outright. app_owner holds
-- exactly one row, which made `update ... set user_id = ...` look obviously
-- safe and be rejected anyway — and it is the one statement the whole
-- ownership handover turns on.
--
-- `where user_id is not null` is true of the single row this table holds,
-- and lands in the plan as a Filter. `where true` is folded away before the
-- guard sees it, and a predicate on the primary key becomes an Index Cond
-- rather than a qual, which is not what the guard is looking for either.
create or replace function public.respond_ownership_transfer(transfer_id uuid, accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  transfer public.ownership_transfers;
begin
  select * into transfer from public.ownership_transfers where id = transfer_id;
  if transfer is null or transfer.status <> 'pending' then
    raise exception 'That offer is no longer open';
  end if;
  if auth.uid() <> transfer.to_user then
    raise exception 'Only the person it was offered to can answer it';
  end if;

  update public.ownership_transfers
  set status = case when accept then 'accepted' else 'declined' end,
      responded_at = now()
  where id = transfer_id;

  if not accept then
    insert into public.notifications (user_id, type, reference_id)
    values (transfer.from_user, 'ownership_declined', transfer_id);
    return;
  end if;

  update public.app_owner
  set user_id = transfer.to_user, since = now()
  where user_id is not null;

  -- Both ends hold Admin afterwards: the new owner needs it, and the old
  -- one keeps the access their work depends on.
  insert into public.user_roles (user_id, role_type)
  values (transfer.to_user, 'admin')
  on conflict do nothing;

  insert into public.user_roles (user_id, role_type)
  values (transfer.from_user, 'admin')
  on conflict do nothing;

  insert into public.notifications (user_id, type, reference_id)
  values (transfer.from_user, 'ownership_accepted', transfer_id);
end;
$$;

-- The weekly board clear has the same shape. It runs as the scheduler
-- rather than through the API, so it has not been failing — but a statement
-- that would be refused from one direction is worth qualifying from both.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('clear-message-board');
    perform cron.schedule(
      'clear-message-board',
      '0 0 * * 2',
      $job$
        delete from public.notifications where type = 'message';
        delete from public.messages where ctid is not null;
      $job$
    );
  end if;
end $$;
