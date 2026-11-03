-- 0253: anybody owed a refund may say where to send it (asked for by the
-- Owner after seeing the ticket page).
--
-- 0250 took bank details only from somebody who had paid cash at
-- reception, because a bank transfer or a PayPal payment goes back the
-- way it came. But a refund that goes back the way it came can take a
-- week, can bounce off a closed account, and is not what everybody
-- wants: a person may prefer it in another account, or may still be
-- waiting after the 5–7 working days it should take. So the ticket page
-- now offers the form to every refund owed, required for cash and a
-- choice for the rest, and registration_refund_request() takes details
-- from any order with a refund owed.
--
-- registration_refund_needs_details() keeps its meaning — the details
-- are *required*, which the ticket page and the office still use to know
-- when to ask rather than offer — and the view still sends it as
-- refund_details_wanted. Nothing else changes: the details stay readable
-- only with the Refunds right, and are deleted when the refund is marked.

create or replace function public.registration_refund_request(p_code text, p_details jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  o public.registration_orders%rowtype;
  v_name text := btrim(coalesce(p_details ->> 'account_name', ''));
  v_sort text := nullif(regexp_replace(coalesce(p_details ->> 'sort_code', ''), '[^0-9]', '', 'g'), '');
  v_acct text := nullif(regexp_replace(coalesce(p_details ->> 'account_number', ''), '[^0-9]', '', 'g'), '');
  v_iban text := nullif(upper(regexp_replace(coalesce(p_details ->> 'iban', ''), '\s', '', 'g')), '');
  v_note text := nullif(left(btrim(coalesce(p_details ->> 'note', '')), 500), '');
begin
  select * into o from public.registration_orders where code = upper(btrim(p_code)) for update;
  if not found then raise exception 'No such ticket.'; end if;
  if o.refund_status is distinct from 'owed' then
    raise exception 'There is no refund owed on this registration.';
  end if;
  if length(v_name) < 1 or length(v_name) > 120 then raise exception 'Give the name on the account.'; end if;
  if v_iban is null and (v_sort is null or v_acct is null) then
    raise exception 'Give the sort code and account number, or an IBAN.';
  end if;
  if v_sort is not null and v_sort !~ '^[0-9]{6}$' then raise exception 'A sort code is six digits.'; end if;
  if v_acct is not null and v_acct !~ '^[0-9]{8}$' then raise exception 'An account number is eight digits.'; end if;
  if v_iban is not null and v_iban !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$' then raise exception 'That IBAN does not look right.'; end if;

  insert into public.registration_refund_details (order_id, account_name, sort_code, account_number, iban, note)
  values (o.id, v_name, v_sort, v_acct, v_iban, v_note)
  on conflict (order_id) do update
    set account_name = excluded.account_name, sort_code = excluded.sort_code, account_number = excluded.account_number,
        iban = excluded.iban, note = excluded.note, created_at = now();
end;
$$;

comment on table public.registration_refund_details is
  'Bank details sent for a refund: required when it was paid in cash at reception, a choice otherwise (another account, or the refund has not come back). Readable only with the Refunds right; deleted when the refund is marked done.';
comment on function public.registration_refund_needs_details(public.registration_orders) is
  'Whether the attendee *must* send bank details for this refund: owed, and paid in cash at reception. Any refund owed *may* send them (0253).';
