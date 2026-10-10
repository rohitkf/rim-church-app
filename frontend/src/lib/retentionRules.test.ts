import { describe, expect, it } from 'vitest'
import rules from '../../../supabase/migrations/0128_everything_has_a_clock.sql?raw'
import hourly from '../../../supabase/migrations/0129_timed_posts_expire_on_the_hour.sql?raw'
import alerts from '../../../supabase/migrations/0130_sent_alerts_clear_on_their_day.sql?raw'
import nightly from '../../../supabase/migrations/0131_services_go_after_two_weeks.sql?raw'
import weekly from '../../../supabase/migrations/0132_supabase_logs_and_upload_limits.sql?raw'
import { DEFAULT_SETTINGS } from './appSettings'
import { UPLOAD_LIMIT_BYTES } from './uploadLimits'

/*
 * The clocks the church chose (0128), checked against the migration that
 * runs them. A default the form shows that the database does not use is
 * a promise nobody keeps; an upload limit the app checks that the bucket
 * does not enforce is a limit anybody can step round.
 */

// The five run as one change, split only so each could be applied alone.
const migration = [rules, hourly, alerts, nightly, weekly].join('\n')

const columnDefault = (column: string) =>
  Number(migration.match(new RegExp(`alter column ${column} set default (\\d+)`))?.[1] ??
    migration.match(new RegExp(`${column} [a-z]+ (?:not null )?default (\\d+)`))?.[1])

const bucketLimit = (bucket: string) => {
  const m = migration.match(new RegExp(`set file_size_limit = (\\d+) \\* 1024 \\* 1024[^;]*where id = '${bucket}'`))
  return m ? Number(m[1]) * 1024 * 1024 : NaN
}

describe('the church’s clocks (0128–0132)', () => {
  it('starts every setting where the database does', () => {
    expect(columnDefault('service_retention_days')).toBe(DEFAULT_SETTINGS.service_retention_days)
    expect(columnDefault('notification_keep_count')).toBe(DEFAULT_SETTINGS.notification_keep_count)
    expect(columnDefault('alert_clear_dow')).toBe(DEFAULT_SETTINGS.alert_clear_dow)
    expect(columnDefault('team_chat_retention_days')).toBe(DEFAULT_SETTINGS.team_chat_retention_days)
    expect(columnDefault('feedback_retention_days')).toBe(DEFAULT_SETTINGS.feedback_retention_days)
    expect(columnDefault('debrief_retention_days')).toBe(DEFAULT_SETTINGS.debrief_retention_days)
    expect(columnDefault('issue_retention_days')).toBe(DEFAULT_SETTINGS.issue_retention_days)
    expect(columnDefault('church_update_retention_days')).toBe(DEFAULT_SETTINGS.church_update_retention_days)
    expect(columnDefault('poll_retention_days')).toBe(DEFAULT_SETTINGS.poll_retention_days)
  })

  it('is what the church asked for', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      service_retention_days: 14,
      debrief_retention_days: 14,
      issue_retention_days: 14,
      notification_keep_count: 10,
      team_chat_retention_days: 30,
      alert_clear_dow: 2, // Tuesday
      church_update_retention_days: 30,
      feedback_retention_days: 14,
    })
  })

  it('checks uploads against the same limits the buckets enforce', () => {
    expect(bucketLimit('branding')).toBe(UPLOAD_LIMIT_BYTES.logo)
    expect(bucketLimit('giving')).toBe(UPLOAD_LIMIT_BYTES.givingQr)
    expect(bucketLimit('handbooks')).toBe(UPLOAD_LIMIT_BYTES.handbook)
    expect(bucketLimit('inventory-docs')).toBe(UPLOAD_LIMIT_BYTES.inventoryDoc)
  })

  it('hides an update once it ends and a poll once it clears, for everybody', () => {
    expect(migration).toMatch(/alter policy church_updates_select[\s\S]*?and ends_at > now\(\)\);/)
    expect(migration).toMatch(/alter policy team_polls_select[\s\S]*?and clears_at > now\(\)/)
  })

  it('runs every clock: hourly for timed posts, weekly for Supabase’s own logs', () => {
    expect(migration).toContain("cron.schedule('expire-timed-posts', '5 * * * *'")
    expect(migration).toContain("cron.schedule('clear-sent-alerts', '0 0 * * *'")
    expect(migration).toContain("cron.schedule('prune-platform-logs', '30 3 * * 2'")
    expect(migration).toMatch(/delete from public\.services\s+where date < today - s\.service_retention_days/)
    expect(migration).toMatch(/create or replace trigger notifications_keep_newest\s+after insert on public\.notifications/)
  })

  it('never lets an Admin clear a join request that is still waiting', () => {
    expect(migration).toMatch(/team_join_requests_admin_delete[\s\S]*?status <> 'pending'/)
  })
})
