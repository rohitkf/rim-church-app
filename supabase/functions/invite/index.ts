/**
 * Inviting somebody to sign up.
 *
 * The invite itself is `auth.admin.inviteUserByEmail`, which needs the service
 * role key — a key that can read and write everything, and must never reach a
 * browser. So it lives here, and the page calls this.
 *
 * Being an edge function does not make it safe on its own: the caller's own
 * token is checked first, and only an Admin, a Department Head or an Assisting
 * Head may invite anyone. Without that, anybody with the anon key could mail
 * the world from the church's address.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return json({ error: 'Not signed in.' }, 401)

  // Who is asking. This client carries the caller's own token, so every read
  // below is the caller's read — RLS applies exactly as it does in the app.
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await asCaller.auth.getUser()
  if (userError || !userData?.user) return json({ error: 'Not signed in.' }, 401)
  const caller = userData.user

  let payload: {
    email?: string
    department_id?: string | null
    member_type?: string | null
    first_name?: string
    last_name?: string
  }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400)
  }

  const email = (payload.email ?? '').trim().toLowerCase()
  const departmentId = payload.department_id ?? null
  // Core unless somebody says guest — which is what the column defaulted to
  // before anybody was asked, and the safer way round: a guest wrongly
  // recorded as core makes a team look short, a core member wrongly
  // recorded as guest makes it look fuller than it is.
  const memberType = payload.member_type === 'guest' ? 'guest' : 'core'
  // An invitation carries no name of its own, so a profile created from one
  // arrives blank and the invited person is a nameless row on the rota until
  // they fill it in. Whoever is inviting knows the name — this carries it.
  const firstName = (payload.first_name ?? '').trim().slice(0, 80)
  const lastName = (payload.last_name ?? '').trim().slice(0, 80)
  // Deliberately loose: an address is valid if a mail server says so, and a
  // stricter pattern here would only reject real addresses.
  if (!email || !email.includes('@') || email.length > 320) {
    return json({ error: "That doesn't look like an email address." }, 400)
  }

  // May they invite? The church's grid says (Settings › Access & privileges,
  // people.invite, 0144): may_invite() asks the same may() every rule does.
  // With no team named, any team they may invite to will do.
  const admin = createClient(url, serviceKey)
  const { data: allowed, error: mayError } = await admin.rpc('may_invite', {
    uid: caller.id,
    dept: departmentId,
  })
  if (mayError) return json({ error: 'Could not check your permissions.' }, 500)
  if (allowed !== true) {
    return json({ error: 'Inviting people to that team is not open to you.' }, 403)
  }

  // Already here? Saying so is kinder than sending an invite that lands on
  // somebody who has been using the app for a month. One exact address, never
  // a pattern: `profiles.email` is the account's address (0169) and only the
  // Owner may read it, so this check must answer one question about one
  // address and nothing about any other. Case-insensitive, because an
  // address is, with the LIKE characters escaped so that `%` and `_` in the
  // caller's text mean themselves; and a lookup that fails is a refusal, not
  // a pass.
  const literal = email.replace(/[\\%_]/g, (c) => `\\${c}`)
  const { data: existing, error: existingError } = await admin
    .from('profiles')
    .select('id')
    .ilike('email', literal)
    .maybeSingle()
  if (existingError) return json({ error: 'Could not check that address.' }, 500)
  if (existing) return json({ error: 'That address already has an account.' }, 409)

  const redirectTo = signupRedirect(req)
  // `data` becomes the new user's metadata, which is where handle_new_user
  // reads the name from when it writes the profile. Sent only when there is
  // something to send: empty strings would overwrite nothing with nothing.
  const metadata: Record<string, string> = {}
  if (firstName) metadata.first_name = firstName
  if (lastName) metadata.last_name = lastName

  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    ...(Object.keys(metadata).length > 0 ? { data: metadata } : {}),
  })
  if (inviteError) {
    // The most common failure by far is a rate limit, which is worth saying
    // plainly rather than as "unexpected failure". It does not name a fix,
    // deliberately: Supabase caps auth emails per project on top of
    // whatever the mail provider allows, so the old advice to "set up
    // custom SMTP" sent whoever read it to a setting that was already
    // configured. Waiting is the answer either way.
    const message = /rate|limit/i.test(inviteError.message)
      ? 'Too many invitations have gone out in the last hour — that is a limit on the account, not on this address. Try again shortly.'
      : inviteError.message
    return json({ error: message }, 400)
  }

  // The record of who asked, kept whether or not they ever turn up.
  const { error: recordError } = await admin.from('invitations').upsert(
    {
      email,
      department_id: departmentId,
      member_type: memberType,
      invited_by: caller.id,
      created_at: new Date().toISOString(),
      accepted_at: null,
    },
    { onConflict: 'email' },
  )
  if (recordError) {
    // The invitation is already in the post; failing the whole call now would
    // tell the sender it did not happen.
    console.error('invite recorded badly', recordError)
  }

  return json({ ok: true, email })
})

/**
 * Where the invitation link should land: the app's own sign-up page, at the
 * configured SITE_URL. Never at whatever `Origin` the request claims — that
 * header is the caller's to write, and this link carries a sign-in token.
 * With SITE_URL unset the platform's Site URL applies.
 */
function signupRedirect(_req: Request): string | undefined {
  const site = Deno.env.get('SITE_URL')
  if (site) return `${site.replace(/\/$/, '')}/reset-password`
  console.warn('SITE_URL is not set; the invitation link falls back to the project Site URL')
  return undefined
}
