/**
 * How many days an account may wait for its confirmation link to be
 * pressed before it is removed (0317, `delete_unconfirmed_accounts()`).
 *
 * The database does the removing, once a day, and holds the same number;
 * `unconfirmedAccounts.test.ts` reads the migration and fails when the two
 * part. Said to whoever has just signed up, where the app says the link
 * was sent: they can sign up again afterwards, and should know why they
 * would have to.
 */
export const UNCONFIRMED_ACCOUNT_DAYS = 7
