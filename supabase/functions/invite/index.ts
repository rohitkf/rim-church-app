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

  let payload: { email?: string; department_id?: string | null }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400)
  }

  const email = (payload.email ?? '').trim().toLowerCase()
  const departmentId = payload.department_id ?? null
  // Deliberately loose: an address is valid if a mail server says so, and a
  // stricter pattern here would only reject real addresses.
  if (!email || !email.includes('@') || email.length > 320) {
    return json({ error: "That doesn't look like an email address." }, 400)
  }

  // May they invite? Admin anywhere; a Head or Assisting Head for their team.
  const admin = createClient(url, serviceKey)
  const { data: grants, error: grantsError } = await admin
    .from('user_roles')
    .select('role_type, department_id')
    .eq('user_id', caller.id)
  if (grantsError) return json({ error: 'Could not check your permissions.' }, 500)

  const isAdmin = (grants ?? []).some((g) => g.role_type === 'admin')
  const leadsTeam = (grants ?? []).some(
    (g) =>
      (g.role_type === 'department_head' || g.role_type === 'assisting_head') &&
      (departmentId === null || g.department_id === departmentId),
  )
  if (!isAdmin && !leadsTeam) {
    return json({ error: 'Only an Admin or a team Head can invite somebody.' }, 403)
  }

  // Already here? Saying so is kinder than sending an invite that lands on
  // somebody who has been using the app for a month.
  const { data: existing } = await admin
    .from('profiles')
    .select('id')
    .ilike('email', email)
    .maybeSingle()
  if (existing) return json({ error: 'That address already has an account.' }, 409)

  const redirectTo = signupRedirect(req)
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
  })
  if (inviteError) {
    // The most common failure by far is the project's own email rate limit,
    // which is worth saying plainly rather than as "unexpected failure".
    const message = /rate|limit/i.test(inviteError.message)
      ? 'The email limit for this project has been reached — try again later, or set up custom SMTP in Supabase.'
      : inviteError.message
    return json({ error: message }, 400)
  }

  // The record of who asked, kept whether or not they ever turn up.
  const { error: recordError } = await admin.from('invitations').upsert(
    {
      email,
      department_id: departmentId,
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

/** Where the invitation link should land: the app's own sign-up page. */
function signupRedirect(req: Request): string | undefined {
  const site = Deno.env.get('SITE_URL')
  if (site) return `${site.replace(/\/$/, '')}/reset-password`
  const origin = req.headers.get('origin')
  return origin ? `${origin}/reset-password` : undefined
}
