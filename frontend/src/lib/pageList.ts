import { NAV_ITEMS, type NavItem } from './navItems'
import { PAGE_RULES, type PageRule } from './pageAccess'

/**
 * Every page the church sets a rule for, in the menu's order — the list
 * Settings › Access shows, both Pages and By person.
 */
export function pagesWithRules(): { item: NavItem; rule: PageRule }[] {
  return NAV_ITEMS.map((item) => ({ item, rule: PAGE_RULES[item.to] })).filter((p) => p.rule)
}
