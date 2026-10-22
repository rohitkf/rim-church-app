-- 0169 and 0170 added five CHECK constraints NOT VALID, so that a row
-- already in the table could not stop the migration: a name's length, a
-- board post's length and mention count, and where an avatar may point.
-- NOT VALID still binds every new and changed row; it only leaves the old
-- ones unexamined. On production nothing breaks any of the five, so they
-- are validated here — and first, anything that would, in another copy of
-- this database, is brought within the rule rather than left to fail the
-- migration: control characters leave a name and it is cut at 80, a post is
-- cut at 4000 and keeps its first 20 mentions, an avatar that is not ours
-- is dropped. Each statement touches only rows the rule would refuse.

update public.profiles
   set first_name = left(regexp_replace(first_name, '[[:cntrl:]]', '', 'g'), 80),
       last_name  = left(regexp_replace(last_name,  '[[:cntrl:]]', '', 'g'), 80)
 where length(first_name) > 80 or first_name ~ '[[:cntrl:]]'
    or length(last_name)  > 80 or last_name  ~ '[[:cntrl:]]';

update public.profiles
   set avatar_url = null
 where avatar_url is not null
   and avatar_url !~ '^https://[a-z0-9-]+\.supabase\.(co|in)/storage/v1/object/'
   and avatar_url !~ '^[A-Za-z0-9][A-Za-z0-9._/-]*$';

update public.messages
   set body = left(body, 4000)
 where length(body) > 4000;

-- A post with nothing in it is nothing.
delete from public.messages where length(body) = 0;

update public.messages
   set mentions = mentions[1:20]
 where coalesce(array_length(mentions, 1), 0) > 20;

alter table public.profiles validate constraint profiles_first_name_is_a_name;
alter table public.profiles validate constraint profiles_last_name_is_a_name;
alter table public.profiles validate constraint profiles_avatar_url_is_ours;
alter table public.messages validate constraint messages_body_is_a_post;
alter table public.messages validate constraint messages_mentions_are_few;
