/*
 * Tithes and offerings.
 *
 * A page every signed-in member can open that says how to give: the
 * church's bank accounts, and links to wherever it takes card payments —
 * a Stripe Payment Link, PayPal, a giving platform — each drawn as a
 * button and a QR code. An Admin keeps all of it from App settings.
 *
 * No payment passes through this app. A link opens the provider's own
 * page, which is where Apple Pay and Google Pay are offered and where the
 * card details go, so the app never sees a card number or holds a
 * provider's secret key. What is stored here is what the church would
 * print in a newsletter.
 *
 *   giving_page           one row: a welcome line, and an optional QR
 *                         image an Admin uploads (for a code a bank or a
 *                         provider issued as a picture);
 *   giving_links          label, https link, a note; shown as a button
 *                         and, if wanted, a QR code drawn from the link;
 *   giving_bank_accounts  as many accounts as the church has — a general
 *                         fund, a building fund — each a proper form.
 */

create table if not exists public.giving_page (
  id boolean primary key default true check (id),
  intro text check (intro is null or length(intro) <= 1000),
  -- A path in the `giving` bucket, as the logo is in `branding`.
  qr_image_path text,
  qr_image_caption text check (qr_image_caption is null or length(qr_image_caption) <= 120),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.giving_page (id) values (true) on conflict do nothing;

create table if not exists public.giving_links (
  id uuid primary key default gen_random_uuid(),
  label text not null check (length(btrim(label)) between 1 and 60),
  -- https only: a `javascript:` or `data:` link on a button every member
  -- presses is the one thing this table must never hold.
  url text not null check (url ~* '^https://[^\s]+$' and length(url) <= 2000),
  note text check (note is null or length(note) <= 300),
  show_qr boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.giving_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  -- What it is for: "Tithes and offerings", "Building fund".
  label text not null check (length(btrim(label)) between 1 and 60),
  account_name text not null check (length(btrim(account_name)) between 1 and 100),
  bank_name text check (bank_name is null or length(bank_name) <= 100),
  sort_code text check (sort_code is null or sort_code ~ '^[0-9]{2}-?[0-9]{2}-?[0-9]{2}$'),
  account_number text check (account_number is null or account_number ~ '^[0-9]{6,10}$'),
  iban text check (iban is null or replace(iban, ' ', '') ~* '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$'),
  bic text check (bic is null or bic ~* '^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$'),
  -- What to put as the payment reference, e.g. "Your name + TITHE".
  reference text check (reference is null or length(reference) <= 100),
  notes text check (notes is null or length(notes) <= 500),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  -- Something has to identify the account: UK details, or an IBAN.
  check ((sort_code is not null and account_number is not null) or iban is not null)
);

alter table public.giving_page enable row level security;
alter table public.giving_links enable row level security;
alter table public.giving_bank_accounts enable row level security;

-- Read by anybody signed in — a church member on no team included; that
-- is who the page is for. Written by an Admin.
do $pol$
declare
  t text;
begin
  foreach t in array array['giving_page', 'giving_links', 'giving_bank_accounts'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select using (auth.uid() is not null)',
      t || '_select', t
    );
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format(
      'create policy %I on public.%I for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()))',
      t || '_write', t
    );
  end loop;
end $pol$;

-- The one row is updated, never inserted or deleted, by the app.
revoke insert, delete on public.giving_page from authenticated;

/*
 * The uploaded QR image. Private like every bucket here — the page signs
 * a URL for it. Raster only: unlike the logo, which only the Owner can
 * change, any Admin can put a file here, so SVG (which can carry script
 * if it is ever opened directly) is left off the list.
 */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('giving', 'giving', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
set file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists giving_select on storage.objects;
drop policy if exists giving_insert on storage.objects;
drop policy if exists giving_update on storage.objects;
drop policy if exists giving_delete on storage.objects;

create policy giving_select on storage.objects
  for select using (bucket_id = 'giving' and auth.uid() is not null);
create policy giving_insert on storage.objects
  for insert with check (bucket_id = 'giving' and public.is_admin(auth.uid()));
create policy giving_update on storage.objects
  for update using (bucket_id = 'giving' and public.is_admin(auth.uid()));
create policy giving_delete on storage.objects
  for delete using (bucket_id = 'giving' and public.is_admin(auth.uid()));

-- Live, so a corrected sort code shows on a page somebody already has open.
do $pub$
declare
  t text;
begin
  foreach t in array array['giving_page', 'giving_links', 'giving_bank_accounts'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $pub$;
