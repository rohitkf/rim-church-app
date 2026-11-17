/**
 * How far a sign-out reaches: this device, and nothing else the person is
 * signed in on. Kept here, apart from AuthContext, so a test can hold it.
 */
export const SIGN_OUT_SCOPE = 'local' as const
