import { NAV_ITEMS, type NavItem } from './navItems'
import { SERVING_TABS } from './serving'
import { PAGE_RULES, type PageRule } from './pageAccess'

/**
 * Every page the church sets a rule for, in the menu's order — the list
 * Settings › Access shows, both Pages and By person.
 *
 * Serving is one menu entry but three pages with three different rules,
 * so each of its tabs is listed on its own.
 */
export function pagesWithRules(): { item: NavItem; rule: PageRule }[] {
  return NAV_ITEMS.flatMap((item) =>
    item.tabs
      ? item.tabs.map((to) => ({ ...item, to, tabs: undefined, label: SERVING_TABS.find((t) => t.to === to)?.label ?? to }))
      : [item],
  )
    .map((item) => ({ item, rule: PAGE_RULES[item.to] }))
    .filter((p) => p.rule)
}
