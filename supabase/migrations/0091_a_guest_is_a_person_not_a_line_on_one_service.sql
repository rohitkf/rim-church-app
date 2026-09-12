/*
 * The people who help without an account, kept once rather than retyped.
 *
 * A guest belonged to a service. Next month's visitor was assumed to be a
 * different person, so every service started with an empty box and
 * whoever was planning it typed the name in again. Twenty-nine rows in
 * this church's table say how that ends: "Godlee Cherian" and "Ps Godlee
 * Cherian", "Sam" and "Ps Sam", "Roji" and "Roji Malachi" — the same
 * handful of people, spelled however the hurry of the moment spelled
 * them, and none of them findable from the service you are planning now.
 *
 * So a guest becomes a person the church knows: one row, reusable, with
 * the designation they are introduced by. The per-service list goes; a
 * session points straight at the guest.
 */

create table if not exists public.guests (
  id uuid primary key default gen_random_uuid(),
  /* What they are called, and what they are called before that. The title
     is free text on purpose — Pastor, Ps, Apostle, Evangelist, Bishop,
     Br, Sr are all in use in one church or another, and a list of the
     ones we thought of is a list somebody's minister is missing from. */
  name text not null check (length(btrim(name)) > 0),
  title text,
  note text,
  /*
   * Set when a guest turns up with an account of their own.
   *
   * They stop being offered as a guest — they are a member now, and two
   * of the same person in one picker is how a rota ends up half-assigned
   * to a ghost. What is not done is rewriting the past: a session that
   * says a guest took it goes on saying so, and that name still resolves,
   * because that is what happened.
   */
  became_member uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists guests_name_idx on public.guests (lower(name));

drop trigger if exists guests_touch on public.guests;
create trigger guests_touch
  before update on public.guests
  for each row execute function public.touch_updated_at();

alter table public.guests enable row level security;

/* Everybody signed in can read the roll: a picker that cannot see a name
   cannot offer it, and the running order names guests to anyone reading
   it. Only an Admin writes. */
drop policy if exists guests_select on public.guests;
create policy guests_select on public.guests
  for select using (auth.uid() is not null);

drop policy if exists guests_write on public.guests;
create policy guests_write on public.guests
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

/*
 * Everyone who was ever a guest, once each.
 *
 * Matched on the name with its case and spacing ignored, which is what
 * makes "Sam" and "Sam " one person and leaves "Sam" and "Ps Sam" two —
 * correctly, because nothing here knows they are the same man. The
 * earliest row wins the note, being the one somebody wrote on purpose.
 */
insert into public.guests (name, note, created_at)
select distinct on (lower(btrim(sg.name)))
  btrim(sg.name),
  nullif(btrim(coalesce(sg.note, '')), ''),
  sg.created_at
from public.service_guests sg
order by lower(btrim(sg.name)), sg.created_at;

/*
 * Every session that named a guest now names the same person in the roll.
 *
 * The old foreign key comes off first. It points at the per-service list,
 * and it would refuse every one of these rows on the way past — the new
 * id is a real guest but not a real service_guest, which is precisely the
 * change being made.
 */
alter table public.service_sessions drop constraint if exists service_sessions_guest_id_fkey;

update public.service_sessions s
set guest_id = g.id
from public.service_guests sg
join public.guests g on lower(g.name) = lower(btrim(sg.name))
where s.guest_id = sg.id;

alter table public.service_sessions
  add constraint service_sessions_guest_id_fkey
  foreign key (guest_id) references public.guests(id) on delete set null;

drop table if exists public.service_guests;

/* The roll changes while other people have the planner open. */
alter publication supabase_realtime add table public.guests;
