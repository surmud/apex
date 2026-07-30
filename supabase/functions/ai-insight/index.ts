// Supabase Edge Function: AI proxy for Apex.
// Holds the developer's Anthropic API key server-side so end users never
// need their own. The client sends a system prompt, user content, and a
// JSON schema; the function returns the parsed structured result.
//
// Deploy:  npx supabase functions deploy ai-insight --no-verify-jwt
// Secret:  npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODEL = 'claude-haiku-4-5';
const MAX_TOKENS_CAP = 6000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY is not configured on the server' }, 500);

    const { system, user, schema, max_tokens } = await req.json();
    if (!system || !user || !schema) return json({ error: 'system, user, and schema are required' }, 400);

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: Math.min(Number(max_tokens) || 2000, MAX_TOKENS_CAP),
        system,
        output_config: { format: { type: 'json_schema', schema } },
        messages: [{ role: 'user', content: user }],
      }),
    });

    const data = await res.json();
    if (!res.ok) return json({ error: data?.error?.message ?? 'Model request failed' }, res.status);

    const text = (data.content ?? []).find((b: any) => b.type === 'text');
    if (!text) return json({ error: 'Empty model response' }, 502);
    return json(JSON.parse(text.text), 200);
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
