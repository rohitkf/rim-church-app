-- Phone numbers carry their country.
--
-- The app now saves numbers in international form ("+447912345678") and
-- shows a country beside the box. Numbers saved before that were written
-- the way people write them at home. The unambiguous ones — a UK mobile,
-- "07" and nine more digits, however it was spaced — are rewritten here.
-- Anything else is left exactly as it was: a landline, a number from
-- elsewhere or a stray note could be guessed wrong, and the app asks the
-- person to confirm those themselves.
--
-- No constraint is added on the column. A check would refuse any later
-- update to a row still holding an older number, including updates that
-- had nothing to do with the phone.
update public.profiles
set phone = '+44' || substr(regexp_replace(phone, '[\s().-]', '', 'g'), 2)
where regexp_replace(phone, '[\s().-]', '', 'g') ~ '^07[0-9]{9}$';
