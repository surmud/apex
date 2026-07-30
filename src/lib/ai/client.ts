/**
 * One entry point for every model call in the app.
 *
 * Model: claude-haiku-4-5. The work here is reading structured training
 * data and writing short structured assessments, which Haiku handles well
 * at a fraction of the cost of larger models.
 *
 * Transport, in order of preference:
 * 1. The app's server proxy (a Supabase edge function holding a developer
 *    API key). Zero setup for the user. This is the default path.
 * 2. The user's own Anthropic key from Settings, sent directly to the
 *    Anthropic API from the device. Power-user escape hatch, and the
 *    fallback when no proxy is deployed.
 *
 * Both paths use plain fetch rather than the @anthropic-ai/sdk package.
 * The SDK's Node build pulls in node:fs for its credential-file loading,
 * which Metro cannot resolve in a React Native bundle (no Node runtime on
 * device) — fetch avoids that dependency entirely and is all this needs.
 */

export const AI_MODEL = 'claude-haiku-4-5';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '';

export type MessageContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
    >;

export interface StructuredRequest {
  system: string;
  user: MessageContent;
  schema: Record<string, unknown>;
  maxTokens?: number;
}

export async function claudeStructured<T>(
  userApiKey: string | null,
  req: StructuredRequest,
): Promise<T> {
  if (userApiKey) {
    return direct<T>(userApiKey, req);
  }
  try {
    return await viaProxy<T>(req);
  } catch (e: any) {
    if (e?.code === 'proxy_unavailable') {
      throw new Error(
        'The AI service is not set up yet. Deploy the ai-insight function (see README) or add your own Anthropic API key in Settings.',
      );
    }
    throw e;
  }
}

async function direct<T>(apiKey: string, req: StructuredRequest): Promise<T> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: req.maxTokens ?? 2000,
      system: req.system,
      output_config: { format: { type: 'json_schema', schema: req.schema } },
      messages: [{ role: 'user', content: req.user }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `AI request failed (${res.status})`);
  const text = (data.content ?? []).find((b: any) => b.type === 'text');
  if (!text) throw new Error('No response from the model');
  return JSON.parse(text.text) as T;
}

async function viaProxy<T>(req: StructuredRequest): Promise<T> {
  if (!SUPABASE_URL) {
    const err: any = new Error('proxy not configured');
    err.code = 'proxy_unavailable';
    throw err;
  }
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-insight`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_KEY}`,
      apikey: SUPABASE_KEY,
    },
    body: JSON.stringify({
      system: req.system,
      user: req.user,
      schema: req.schema,
      max_tokens: req.maxTokens ?? 2000,
    }),
  });
  if (res.status === 404 || res.status === 403) {
    const err: any = new Error('proxy not deployed');
    err.code = 'proxy_unavailable';
    throw err;
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `AI request failed (${res.status})`);
  return data as T;
}
