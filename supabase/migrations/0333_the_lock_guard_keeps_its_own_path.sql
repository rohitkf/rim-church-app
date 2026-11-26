-- The lock guard keeps its own search path.
--
-- A function that leaves `search_path` to its caller looks tables and
-- functions up wherever the caller says to look first, which is how a
-- trusted function is made to run somebody else's code. Every function
-- here pins it; 0205 pinned this one.
--
-- 0331 then replaced stage_block_lock_guard() to make it guard INSERT as
-- well as UPDATE, and `create or replace function` replaces a function's
-- settings along with its body: the pin went with the old definition, and
-- nothing said so. The database's own advisor found it (November 2026,
-- "Function Search Path Mutable", the only one of its kind).
--
-- The function names no table and calls nothing but current_setting(), so
-- the empty path 0205 gave it is still the right one.
--
-- For whoever replaces a function next: say `set search_path` in the new
-- definition, every time. It is not carried over.

alter function public.stage_block_lock_guard() set search_path = '';

notify pgrst, 'reload schema';
select public.migration_done(333, '0333_the_lock_guard_keeps_its_own_path', '1f509f778e725a3dd2673faa838b8120d60df196149590bd252efad877956156');
