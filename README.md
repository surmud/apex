# Apex

Running analytics for data-literate runners. Every insight ships with a
"How was this calculated?" panel — formula, inputs, output, caveats. No
black-box readiness scores.

Built per [apex_docs/apex-mvp-spec.md](apex_docs/apex-mvp-spec.md).

## Quick start (demo mode — no accounts needed)

```bash
npm install
npm run web        # opens in browser
```

Choose **"Explore with demo data"** on the welcome screen — it generates 10
months of realistic training history (races, treadmill runs, missing-HR runs,
seasonal weather) so every screen is fully populated.

On a phone: install **Expo Go**, run `npm start`, scan the QR code.

## Real Strava data

Client-side pieces are built; two server-side steps are needed once:

1. **Apply the database schema** — paste `supabase/migrations/001_init.sql`
   into the Supabase SQL editor (or `supabase db push`).
2. **Deploy the edge functions** (they proxy Strava OAuth + API because
   Strava has no CORS and the client secret must stay server-side):

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase secrets set STRAVA_CLIENT_ID=... STRAVA_CLIENT_SECRET=...
   npx supabase functions deploy strava-oauth strava-activities strava-callback --no-verify-jwt
   ```

   `strava-callback` is the OAuth bridge: Strava can only redirect to a
   registered web domain, so it redirects here and this function bounces
   the browser back into the app (`apex://onboarding`) with the code.

## AI features with zero user setup

AI Insight, training plan generation and import, and next-run reconciliation
run on claude-haiku-4-5. By default the app calls the `ai-insight` edge
function, which holds a developer API key server-side so end users never
need their own:

```bash
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
npx supabase functions deploy ai-insight --no-verify-jwt
```

Until that is deployed, users can paste their own Anthropic key in Settings
and the app calls the API directly from the device instead.

3. In [strava.com/settings/api](https://www.strava.com/settings/api), set the
   **Authorization Callback Domain** to your Supabase project host, i.e. the
   domain part of `EXPO_PUBLIC_SUPABASE_URL` (looks like
   `<project-ref>.supabase.co`). Both the iOS app and local web dev flow
   route through the `strava-callback` function on that domain, so this one
   setting covers every platform.

Then "Connect Strava" in onboarding (or Settings) does a full backfill with
weather enrichment via Open-Meteo (free, no key).

## Tests

```bash
npx vitest run     # formula engine + demo generator
npx tsc --noEmit   # typecheck
```

## Architecture

- `src/lib/formulas/` — pure, unit-tested sports-science engine (TRIMP, ACWR,
  VO2max, Riegel, fitness–fatigue, heat adjustment, rule-based workout
  classifier, data-quality flags). Every function returns its value **and** an
  `Explanation` object that powers the transparency panels.
- `src/lib/engine.ts` — derives all app state from raw activities in one pure pass.
- `src/lib/demo/` — seeded deterministic demo dataset.
- `src/lib/state/` — persisted app state (AsyncStorage), sync orchestration.
- `src/components/charts/` — hand-rolled SVG chart kit (sparklines, trend,
  bars, stacked bars, scatter+trendline, multi-line), palette validated for
  color-vision deficiency in light and dark mode.
- `src/app/` — Expo Router screens: onboarding, 4 tabs (Dashboard, Post-run,
  Projections, Insights), run detail, course builder, settings.
- `supabase/` — schema migration + edge functions for the real-data path.

## Notes

- Analysis is fully client-side in this build; Supabase becomes the sync/store
  layer when multi-device support lands.
- Strava's personal-use API terms cover this build; public release requires
  their commercial program (spec §10).
