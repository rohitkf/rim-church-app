/*
 * What the logo bucket will take.
 *
 * Two megabytes was chosen for a mark drawn at 36 pixels, and it is the
 * wrong number to say no with: the file somebody has to hand is whatever
 * their designer sent them, and a 6 MB export of a perfectly good logo
 * was refused for being an inch too big for a box it never had to fit in.
 *
 * The app resizes before it uploads now (frontend/src/lib/logoImage.ts) —
 * trimmed of its blank margin, scaled to 512 pixels, written back out as
 * a PNG — so what actually lands here is tens of kilobytes whatever
 * arrives. This limit is the backstop behind the one the page enforces,
 * and the two now say the same number.
 */
update storage.buckets
set file_size_limit = 31457280
where id = 'branding';
