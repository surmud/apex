# Apex — Launch Readiness Tracker

**Living document.** Last updated: 2026-07-29
**Companion to:** [apex-mvp-spec.md](apex-mvp-spec.md) (§10 of the spec is the
origin of several items here; this file supersedes it as the working tracker.)

## How to use this file

This tracks everything standing between the current codebase and a public App
Store release. It is **not** a feature backlog — Tier 0 and most of Tier 1 from
the spec are built. What remains is legal/commercial gating, security
hardening, and store mechanics.

Maintenance rules:
- Update the status box and the changelog at the bottom whenever an item moves.
- Keep file references (`path:line`) current; they rot fast.
- New findings go in the right severity section, not at the end.
- When an item is done, leave it checked with a one-line note on how it was
  resolved. Don't delete it — the history is useful during App Review.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked

---

## Current state (verified 2026-07-29)

- 68 TS/TSX files; `tsc --noEmit` clean; 63 tests passing across 4 files
- All Tier 0 items plus most of Tier 1 implemented
- No TODO/FIXME/stub markers anywhere in `src/`
- **Feature-completeness is not the gap.** The gaps are below.

---

## 1. Critical path — external approvals (start these first)

These have multi-week latency, are outside our control, and no amount of
engineering shortens them. Everything else parallelizes behind them.

- [ ] **Strava commercial API approval** — `SEVERITY: CRITICAL`
  Current connection is personal-use only. Public distribution on those terms
  violates Strava's API agreement. Approval is discretionary and slow.
  **Ask explicitly about AI inference on activity data** — Strava has been
  restrictive here, and AI insights are a core Apex feature. Get the answer in
  writing before building further on top of it.
  Origin: spec §8 #5, §10 #1.

- [ ] **Open-Meteo commercial licence** — `SEVERITY: HIGH`
  The free tier used today is non-commercial only. A public app needs their
  paid customer API. Cheaper and faster to resolve than Strava, but still a
  hard dependency. Used by [weather.ts](../src/lib/api/weather.ts).
  Origin: spec §8 #4, §10 #2.

- [ ] **Apple Developer Program enrollment** — `SEVERITY: HIGH`
  Required for TestFlight, not just public release. Approval can take days.

### Hedge worth holding open

HealthKit is already built ([health.ts](../src/lib/api/health.ts)) and has **no
commercial licensing gate**. If Strava stalls or refuses the AI usage, an
Apple-Health-first iOS launch is a viable path with no dependency on them.
This de-risks the entire critical path — treat it as a real strategic option,
not a fallback.

---

## 2. Security & cost blockers (in our control)

- [ ] **Harden the AI proxy** — `SEVERITY: CRITICAL — highest severity item in the repo`
  [supabase/functions/ai-insight/index.ts](../supabase/functions/ai-insight/index.ts)
  is deployed `--no-verify-jwt`, gated only by the Supabase anon key — which
  ships inside the app bundle and is trivially extractable. There is **no rate
  limiting, no per-user cap, no quota**. Worse, `system` and `schema` come
  straight from the client request body, so anyone with the anon key can send
  arbitrary prompts billed to our Anthropic account.
  Fix requires all three:
  - real auth (not the anon key)
  - per-device/per-user rate limit and spend cap
  - server-side prompt allowlist — client sends an intent + data, not a system prompt
  This is an uncapped billing liability the moment the app is public.

- [ ] **Move secrets to SecureStore** — `SEVERITY: HIGH`
  Strava refresh token and the user's Anthropic API key are persisted in
  **plaintext AsyncStorage** ([AppState.tsx:155](../src/lib/state/AppState.tsx:155)).
  Should be `expo-secure-store` (Keychain/Keystore). Roughly an hour of work.
  Note this contradicts spec §4.1, which assumed server-side token storage.

- [ ] **Crash/error monitoring** — `SEVERITY: HIGH`
  None today. Without it we are blind to every real-device failure. Sentry or
  equivalent, before any external user touches the app. Origin: spec §10 #9.

---

## 3. Build & submission mechanics

- [ ] **Real bundle identifier** — `SEVERITY: CRITICAL, do this first`
  [app.json](../app.json) has `"bundleIdentifier": "com.anonymous.apex"` — the
  Expo default. It is **permanent once submitted**. Change before any build.

- [ ] **`eas.json` build profiles** — `SEVERITY: CRITICAL`
  The file does not exist. We currently cannot produce a store build at all.

- [ ] **`ITSAppUsesNonExemptEncryption` declaration** — `SEVERITY: MEDIUM`
  Not declared in [app.json](../app.json). Absent, every submission triggers a
  manual review question.

- [ ] **Privacy Policy + Terms of Service, publicly hosted** — `SEVERITY: HIGH`
  Required by Apple App Review *and* by Strava's API agreement. Must disclose
  HR/health-adjacent data handling. Origin: spec §10 #3.

- [ ] **App Store Connect listing assets** — `SEVERITY: MEDIUM`
  Icon, per-device screenshots, description, support URL, and the privacy
  "nutrition label" disclosures. Origin: spec §10 #8.

- [ ] **HealthKit review compliance** — `SEVERITY: MEDIUM`
  Apple applies extra scrutiny to HealthKit permission copy and data usage.
  Permission strings currently live in [app.json](../app.json) under the
  `@kingstinct/react-native-healthkit` plugin config. Origin: spec §10 #11.

### Already satisfied

- [x] **In-app data deletion** — [settings.tsx:397](../src/app/settings.tsx:397)
- [x] **Data export** — [settings.tsx:396](../src/app/settings.tsx:396); JSON,
  with a web/native split at [settings.tsx:115](../src/app/settings.tsx:115)
- [x] **Health-data disclaimer** — [settings.tsx:405](../src/app/settings.tsx:405)
  ("Estimates are statistical, not medical advice"). Worth a second pass on
  whether it needs to appear more prominently than Settings.

---

## 4. Architecture decision required

**The app is entirely local-first, and this appears to be accidental rather
than chosen.** `@supabase/supabase-js` is a dependency but `createClient` is
never called anywhere in `src/`.
[supabase/migrations/001_init.sql](../supabase/migrations/001_init.sql) defines
a full schema that nothing reads or writes. Supabase is used *only* as a
stateless proxy (Strava OAuth, Strava CORS, AI calls).

Divergences from spec §4:

| Spec assumed | Reality |
|---|---|
| Tokens server-side, "never exposed to the client" | Plaintext AsyncStorage on device |
| Webhook sync primary, nightly poll safety net | Neither exists; sync is manual pull-to-refresh only |
| Deauth webhook flips `strava_connection_status` | Not built |
| Postgres persistence | Delete the app and all history is gone — no backup, no device migration |

Local-first is **defensible and arguably the smarter MVP choice**: no
server-side health data means far less liability, faster review, and no GDPR
data-controller burden. But it needs to be an owned decision.

- [ ] **Decide: is local-first the shipping architecture?**
  - If **yes** — delete the unused migration and the `@supabase/supabase-js`
    dependency so the codebase stops implying a backend that isn't there. Then
    document the no-backup/no-migration limitation in-app.
  - If **no** — this is a significant build (auth, RLS, sync, webhooks) and
    should be scoped as its own phase.

---

## 5. Validation before opening to real users

- [ ] **Validate the engine against real data** — `SEVERITY: HIGH`
  The formula engine is validated by unit tests, not by reality. TRIMP, VDOT,
  and ACWR against messy real-world HR/GPS data will surface issues no test
  caught. This feedback is worth more than any polish pass and is cheap to get.

- [ ] **TestFlight build for 5–10 runners**
  Depends on: Apple enrollment, bundle ID, `eas.json`, Sentry, SecureStore.

- [ ] **Strava rate-limit check at scale** — `SEVERITY: MEDIUM`
  Per-app limits (100 req/15min, 1000/day) were sized for single-user dev
  testing. Confirm they hold for a real user base. Origin: spec §10 #10.

---

## Recommended sequence

The MVP-vs-polish framing does not apply — the app is past MVP on features, and
public launch is gated by Strava regardless, so rushing engineering does not
move the launch date.

1. **Today:** file the Strava commercial application (longest lead time, free
   to submit, blocks nothing else).
2. **While pending:** AI proxy hardening → SecureStore → bundle ID + `eas.json`
   + encryption declaration + Sentry.
3. **Then:** TestFlight to a handful of runners; validate the engine on real data.
4. **In parallel:** privacy policy, ToS, Open-Meteo commercial tier.
5. **Decide** the local-first question (§4) before building anything further on
   the persistence layer.
6. **Public listing** when Strava clears — or pivot to the Health-only launch
   path if it doesn't.

---

## Changelog

- **2026-07-29** — Created. Initial audit of the codebase after the first
  implementation commit (`e843d1c`). All items above are from that review.
