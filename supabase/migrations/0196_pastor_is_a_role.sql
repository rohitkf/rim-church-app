/*
 * Pastor is a role.
 *
 * Its own migration because a value added to an enum cannot be used in
 * the transaction that adds it; 0197 is everything that uses it.
 */

alter type public.role_type add value if not exists 'pastor';
