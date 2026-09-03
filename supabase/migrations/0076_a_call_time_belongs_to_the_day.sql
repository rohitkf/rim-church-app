-- ============================================================================
-- A call time is for the morning, not for a service
-- ============================================================================
-- `department_call_times` has been keyed by (department, service) since the
-- first migration, which says a team is called separately for each service
-- it serves. That is not what a call time is. Volunteers come in once, before
-- anything starts, and set the building up; then the day runs — English
-- Service, Malayalam Service, whatever else is on. One arrival, one time.
--
-- Keyed by service, a church with two services on a Sunday had to be told
-- the same call time twice, and could be told two different ones — which is
-- a fact about the schema that nobody in the building would recognise.
--
-- So it is re-keyed to the date. The table keeps its name, because three
-- other migrations name it in the reset lists and because there should go on
-- being one obvious place a call time lives.
--
-- Dropped rather than migrated: it is empty, on production and everywhere
-- else. It has never held a row, because until last week nothing could write
-- one.

drop table if exists public.department_call_times;

create table public.department_call_times (
  department_id uuid not null references public.departments(id) on delete cascade,
  -- The day the team is due in, not the service they are due for.
  on_date date not null,
  -- A wall-clock time, deliberately: "seven o'clock" is what a team is told
  -- and what it means, and storing the moment instead would have made the
  -- same seven o'clock depend on which offset was in force when somebody
  -- typed it. The date supplies the day; this supplies the hour.
  call_time time not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  primary key (department_id, on_date)
);

alter table public.department_call_times enable row level security;

-- Everyone signed in reads every team's. Knowing Worship is called at eight
-- is how whoever opens up knows who to expect at the door — and a call time
-- was never private: this is what the policy said before, kept as it was.
create policy department_call_times_select on public.department_call_times
  for select using (auth.uid() is not null);

-- Setting one is the team's own business. `is_dept_head` covers the
-- Assisting Head as well; it has since 0018 widened it.
create policy department_call_times_write on public.department_call_times
  for all using (
    public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), department_id)
  )
  with check (
    public.is_admin(auth.uid()) or public.is_dept_head(auth.uid(), department_id)
  );

create trigger department_call_times_touch_updated_at
  before update on public.department_call_times
  for each row execute function public.touch_updated_at();
