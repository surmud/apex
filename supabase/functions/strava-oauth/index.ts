// Supabase Edge Function: Strava OAuth token exchange + refresh.
// Deployed server-side so the client secret never ships in the app bundle
// and browser CORS restrictions on Strava's token endpoint don't apply.
//
// POST { action: "exchange", code }         → tokens + athlete
// POST { action: "refresh", refresh_token } → new tokens
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { action, code, refresh_token } = await req.json();
    const clientId = Deno.env.get('STRAVA_CLIENT_ID');
    const clientSecret = Deno.env.get('STRAVA_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      return json({ error: 'Strava credentials not configured on the server' }, 500);
    }

    const body: Record<string, string> = { client_id: clientId, client_secret: clientSecret };
    if (action === 'exchange') {
      body.code = code;
      body.grant_type = 'authorization_code';
    } else if (action === 'refresh') {
      body.refresh_token = refresh_token;
      body.grant_type = 'refresh_token';
    } else {
      return json({ error: 'unknown action' }, 400);
    }

    const res = await fetch(STRAVA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return json(data, res.status);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
