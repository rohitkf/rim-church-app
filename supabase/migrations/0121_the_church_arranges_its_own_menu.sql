/*
 * The church arranges its own menu.
 *
 * The More sheet's groups (Sunday, After the service, Talk, Church life,
 * People & things) were written into the app. An Admin can now move pages
 * between groups, reorder groups and the pages in them, rename a group,
 * add one, and remove an empty one, from App settings. One arrangement
 * for the whole church, so "it's under Talk" means the same on every
 * phone.
 *
 * Stored as one JSON object on the settings row:
 *
 *   { "top":    ["/", ...],
 *     "groups": [{ "name": "Sunday", "items": ["/service-planner", ...] }, ...] }
 *
 * Null means the app's own arrangement. Each item is a page's path, which
 * is what the app already keys its pages by. A page the app gains later,
 * not yet in a saved arrangement, goes into the group it would have been
 * in by default, or to the top — the app decides that, not this column.
 *
 * Who may see a page is unchanged: the arrangement only says where a page
 * sits for somebody who can already open it.
 *
 * Written by the same app_settings update policy as every other setting,
 * which only an Admin passes.
 */

alter table public.app_settings
  add column if not exists nav_layout jsonb
    check (
      nav_layout is null
      or (
        jsonb_typeof(nav_layout) = 'object'
        and jsonb_typeof(nav_layout -> 'top') = 'array'
        and jsonb_typeof(nav_layout -> 'groups') = 'array'
        and pg_column_size(nav_layout) <= 16384
      )
    );
