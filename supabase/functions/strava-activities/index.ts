// Supabase Edge Function: proxy Strava activity list/detail calls.
// Exists because Strava's API does not send CORS headers, so browser (Expo web)
// clients can't call it directly. Native clients could, but using one path
// everywhere keeps behavior identical across platforms.
//
// POST { access_token, page?, per_page?, after? } → array of SummaryActivity
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { access_token, page = 1, per_page = 100, after } = await req.json();
    const params = new URLSearchParams({ page: String(page), per_page: String(per_page) });
    if (after) params.set('after', String(after));
    const res = await fetch(`https://www.strava.com/api/v3/athlete/activities?${params}`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
