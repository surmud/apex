// Supabase Edge Function: Strava OAuth callback bridge.
//
// Strava requires the OAuth redirect_uri to live on the app's registered
// "Authorization Callback Domain", which cannot be a custom scheme like
// apex://. So the app sends Strava here, and this function bounces the
// browser straight back into the app (or the web origin) with the code.
//
//   GET ?code=...&state=<return uri>
//     → 302 Location: <return uri>?code=...
//
// Deploy with --no-verify-jwt (the browser arrives with no auth headers):
//   supabase functions deploy strava-callback --no-verify-jwt
//
// Strava app settings: set Authorization Callback Domain to this project's
// functions host, e.g. <project-ref>.supabase.co
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

/** Only bounce to the app scheme or a local/web onboarding page. */
function safeTarget(state: string | null): string | null {
  if (!state) return null;
  try {
    const dec = decodeURIComponent(state);
    if (dec.startsWith('apex://')) return dec;
    const u = new URL(dec);
    if ((u.protocol === 'http:' || u.protocol === 'https:') && u.pathname.endsWith('/onboarding')) {
      return dec;
    }
  } catch {
    // fall through
  }
  return null;
}

Deno.serve((req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const target = safeTarget(url.searchParams.get('state'));

  if (!target) {
    return new Response('Missing or invalid return target.', { status: 400 });
  }
  const sep = target.includes('?') ? '&' : '?';
  const dest = error
    ? `${target}${sep}error=${encodeURIComponent(error)}`
    : `${target}${sep}code=${encodeURIComponent(code ?? '')}`;

  return new Response(null, { status: 302, headers: { Location: dest } });
});
