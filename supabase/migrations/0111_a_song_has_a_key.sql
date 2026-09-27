/*
 * A song has a key.
 *
 * "Goodness of God" in G and in B♭ are two different mornings for the
 * band, and the set list had nowhere to say which. A short text rather
 * than an enum: the page offers the twenty-four major and minor keys,
 * and a worship team that writes "G (capo 2)" is not wrong.
 */
alter table public.set_list_items
  add column if not exists song_key text
  check (song_key is null or length(btrim(song_key)) between 1 and 24);
