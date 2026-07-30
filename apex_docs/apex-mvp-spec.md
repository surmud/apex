# Apex — MVP Build Specification

**Version:** 0.2 (build handoff)
**Date:** July 12, 2026
**Owner:** Surmud
**Status:** Ready for scaffolding

---

## 0. Pre-build checklist (manual steps before kicking off Fable)

These require your credentials/accounts and can't be automated. Do these first — everything else in the plan assumes they're done.

1. **Register a Strava API application** at [developer.strava.com](https://developer.strava.com) → get a real `Client ID` / `Client Secret`, and set an Authorization Callback Domain that matches your dev URL now and your prod domain later.
2. **Fill in `.env`** — it currently has the right keys but empty values: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. All five need real values before OAuth or DB calls will work.
3. **Create the Supabase project** (supabase.com) and pull the URL + anon key + service role key into `.env` from step 2.
4. `.env` was untracked and **not** gitignored — fixed (added a `.gitignore` with `.env` excluded). Confirm it hasn't already been committed anywhere (`git log --all --full-history -- .env` should return nothing).
5. **Provision a public HTTPS endpoint for the Strava webhook callback** (a Supabase Edge Function URL works) — Strava validates webhook subscriptions synchronously at creation time, so this needs to exist before T0-1 sync setup runs.
6. **Enroll in the Apple Developer Program** ($99/yr) now if you haven't — TestFlight requires it, approval can take a few days, and it's also a prerequisite if you want Apple HealthKit (T1-8) or a public App Store release later.
7. Confirm Open-Meteo's free historical-archive rate limits are sufficient for a full-history backfill (Open Question #4) — no key needed, but worth checking before Phase 0 runs a real backfill.
8. Note: Strava's current terms only cover personal use. No action needed to *start building*, but don't share access beyond yourself until Open Question/blocker in §8 is resolved.

---

## 1. Product summary

Apex is a running analytics app for data-literate runners. It quantifies the effect of environmental variables (temperature, humidity), training load, and recovery on running performance — and shows its statistical work transparently rather than hiding it behind a black-box "readiness score."

The core insight driving the product: existing running apps show data but don't tell users what to do next, and they make it hard to break out workout data into meaningful segments. Apex solves both.

**Design principle:** progressive disclosure. Smart defaults on the surface, expandable statistical depth underneath. Every insight has a "How was this calculated?" panel with the formula, inputs, and confidence range.

**Explicitly out of scope for v1:** conversational AI coaching, social feed, ML-based personalization (cohort-trained models, predictive scoring). The one exception is the workout-type classifier (T0-7) — it's rule-based/lightweight and stays fully explainable, so it doesn't violate the "no black box" principle this line protects.

---

## 2. Technical stack

| Layer | Choice | Rationale |
| --- | --- | --- |
| Frontend | Expo + React Native + Expo Router | Single codebase → web immediately, iOS via TestFlight same sprint, Android later |
| Backend | Supabase (Postgres + Auth + Storage) | Fast to stand up, identical client from web and native |
| Data source (v1) | Strava OAuth, primary | Only source at MVP launch — see §4 for auth/sync architecture |
| Data source (Tier 1) | Apple HealthKit, secondary/enrichment | iOS-only, native-module only (no Expo web support) — see T1-8 |
| Weather enrichment | External weather API (Open-Meteo preferred — free, no key, historical endpoint) | Strava payloads do not include environmental fields |
| Analytics engine | Deterministic sports-science formulas, + one rule-based classifier | No ML in v1 beyond the explainable workout-type classifier — faster, defensible, no data accumulation required |

**Deliberate non-decisions (defer):** Garmin Connect, push notifications, payments.

---

## 3. Core algorithms (v1 — all formula-based or explainable rules)

| Metric | Method | Inputs |
| --- | --- | --- |
| Training load / strain | Banister TRIMP | Duration, avg HR, resting HR, max HR, sex coefficient |
| Injury / overtraining risk | ACWR (acute:chronic workload ratio, 7d:28d) | Rolling TRIMP |
| VO2max estimate | Firstbeat-style / Daniels VDOT | Pace, HR, elevation-adjusted grade |
| Aerobic efficiency | Efficiency factor = speed ÷ HR | Avg speed (m/s), avg HR |
| Race time projection | Riegel exponent, calibrated per-user | Recent best efforts across distances |
| Fitness trajectory | Banister fitness-fatigue (impulse-response) | TRIMP history |
| Weather-adjusted pace | Heat/humidity pace penalty model | Temp, dewpoint, pace |
| Workout type detection | Rule-based classifier (pace variance + HR-zone time distribution + duration thresholds) | Pace splits, HR zone time, duration — see T0-7 |

**Guardrail:** any projection scenario that implies an unsafe training ramp must surface the ACWR overtraining flag alongside it. The app must never let a user chase a number by overtraining without warning.

---

## 4. Authentication & sync architecture

### 4.1 Strava OAuth & token lifecycle
- Scope requested: `activity:read_all`.
- Store `access_token`, `refresh_token`, and `expires_at` per user in Supabase (service-role write only, never exposed to the client).
- Strava access tokens expire ~6 hours; refresh proactively (e.g., on any API call within 5 minutes of expiry) and **persist the rotated refresh token** — Strava rotates it on every refresh, and reusing a stale one invalidates the connection.
- Handle Strava's **deauthorization webhook event**: on receipt, mark `strava_connection_status = 'disconnected'`, stop sync jobs for that user, and surface a reconnect prompt in Settings — don't silently keep trying to sync a revoked token.
- Any `401` from the Strava API outside the deauth webhook should also flip the same status flag as a fallback (webhook delivery isn't guaranteed).

### 4.2 Sync mechanism (resolves the previous gap in T0-1)
- **Initial backfill:** paginated pull of full activity history on first connect, respecting Strava's rate limits (100 requests/15 min, 1,000/day per app in the standard tier) with exponential backoff on `429`s. Show backfill progress in onboarding (§6, Tab 0).
- **Ongoing sync, primary path:** subscribe to Strava's webhook (push) for new/updated/deleted activities — near-real-time, low API cost.
- **Ongoing sync, safety net:** a nightly polling job per user in case a webhook delivery is missed (webhooks are best-effort, not guaranteed).
- **Manual path:** pull-to-refresh on the Dashboard triggers an on-demand incremental sync.
- **Visible state:** Dashboard header shows "Synced {relative time}" (see updated Tab 1 mockup, §6); Settings shows the same plus a manual "Sync now" button and connection status (Connected / Needs reconnect).

### 4.3 Apple Health (Tier 1, T1-8 — not an MVP blocker)
Included here because it affects the data model now, even though it ships post-MVP:
- iOS-only; **no web support** — Expo web has no HealthKit equivalent, so Strava remains the only web data source indefinitely.
- Requires a custom EAS dev client (HealthKit isn't available in Expo Go) and a HealthKit entitlement on the App ID, which needs the paid Apple Developer account from §0.
- Recommend launching it as a **read-only enrichment source** (e.g., filling in HR data for Strava activities that lack it) rather than a competing primary source — treating it as a second primary source means writing de-duplication logic for activities logged to both, which is real complexity better deferred until there's user demand for it.
- Apple's App Store review applies extra scrutiny to HealthKit permission strings and data usage — factor this into whichever release includes T1-8 (see §10).

---

## 5. Feature tiers

### Tier 0 — MVP (blocks launch)

**T0-0 — Onboarding**
- Welcome screen (value prop, one screen)
- Connect Strava (OAuth)
- Backfill progress state ("Importing your history — 340 of 512 activities")
- Profile setup: sex, date of birth, weight, resting HR, max HR — each has a "why we ask" tooltip; max HR can be left blank and estimated as `220 − age` with a visible "estimated" label until the user overrides it (estimated values measurably reduce TRIMP/VO2max accuracy, so this must be flagged, not silently used)
- Units preference: mi/km, °F/°C
- Lands on Dashboard when done

**T0-1 — Strava ingestion**
- OAuth connect flow, token refresh, and reconnect handling (see §4.1)
- Backfill full activity history on first connect
- Incremental sync: webhook primary, nightly poll safety net, manual pull-to-refresh (see §4.2)
- Normalize into a canonical `activities` table
- Filter out non-run activity types (rides, hikes, walks) at ingestion

**T0-2 — Weather enrichment**
- For each activity, look up historical temp / humidity / dewpoint / wind by GPS start coords + timestamp
- Cache per-activity; never re-fetch
- Graceful null handling (indoor runs, missing GPS)

**T0-3 — Trend dashboard**
- Time-range filter: 7D / 30D / 90D / custom
- Headline metric cards: VO2max, ACWR load status
- Primary trend chart: pace over time
- Secondary trend grid: heart rate, cadence, temperature, humidity (each a mini sparkline + current avg)
- All charts filterable by run type and date range
- Sync status shown in header: "Synced {relative time}" + manual sync affordance (see §4.2)

**T0-4 — Post-workout action card**
- Session summary (distance, pace, HR, elevation)
- Session strain score (TRIMP) with percentile context vs. user's last 30 runs
- Recommended recovery window (hours, expressed as a range)
- Suggested next workout (type + rough distance/intensity)
- Detected workout type with correction control (see T0-7)
- Formula-driven; no ML beyond the classifier

**T0-5 — "How was this calculated?" panel**
- Expandable on every insight
- Displays: formula name, formula itself, the actual input values used, the output, and a confidence range or caveat
- This is a core differentiator, not a nice-to-have

**T0-6 — Data quality flags**
- Detect and surface: GPS drift, missing HR, suspiciously fast splits, indoor/treadmill runs
- Show a visible flag rather than silently rendering bad numbers
- Excluded-from-analysis runs must be visibly excluded, with a reason

**T0-7 — Workout type classifier**
- Every run gets a detected label: **Easy, Tempo, Interval, Long Run, or Race**
- v1 method is a rule-based classifier (not trained ML): thresholds on pace coefficient-of-variation, % time in HR zones 4–5, presence of repeated pace surges (intervals), and duration relative to the user's rolling average — kept deliberately simple and explainable, consistent with the "no black box" principle
- Displayed on the post-workout action card: "Detected as: **Tempo run**" with a one-line rationale (e.g., "62% of time in Z3–Z4, low pace variance") shown in the "How was this calculated?" panel
- User can correct the label with one tap if the classifier is wrong
- Corrections are stored (`workout_type_source: auto_detected | user_corrected`) — this becomes the labeled dataset for a real trained-model upgrade in Tier 2, using the app's own users' corrections rather than an external public dataset (public running-workout-label datasets are scarce, inconsistently labeled, and wouldn't match individual users' pace/HR patterns anyway)
- Resolves Open Question #1 below with a concrete v1 approach

**T0-8 — Settings & account controls**
- Edit profile inputs from onboarding (sex, DOB, weight, resting/max HR, units)
- Connected accounts: Strava status (Connected / Needs reconnect), last synced time, manual "Sync now"
- Data controls: export data, delete account & data (required for App Store review once account creation is in-app — see §10)

---

### Tier 1 — Fast follow (post-MVP, pre-scale)

**T1-1 — Race projections tab (default view)**

- Default: 90-day horizon, current-trajectory scenario
- Distances: 5K, 10K, Half, Marathon (tab-selectable)
- Time horizons: 30 / 60 / 90 / 180 days
- Three scenario bands per distance: **Conservative**, **Target**, **Stretch**
  - Each shows a time *range* (never a point estimate), avg pace, and a plain-language rationale
- Projected split profile chart: pace-per-mile curve for each scenario
- Training requirements comparison table: peak weekly mileage, long run peak, long runs ≥ threshold, speed work/wk, tempo runs/wk, training weeks, weekly structure
- Fitness inputs panel: the actual data feeding the model (recent PRs, efficiency gain, current mpw)
- **Cold-start state:** if a user has < 3 weeks of history, show a "not enough history yet" state instead of a fake-confident number

**T1-2 — Course builder (user-input course information)**

- User can create a course by entering: name, distance, total elevation gain, elevation profile (optional — segment-by-segment or file upload), expected race-day temp/humidity
- Course factor is computed and applied to all projections for that course (e.g. "810 ft of gain adds ~4–7 min vs. a flat course")
- User can flag key course features (major climbs at mile X) and see them reflected in the split profile
- Saved courses are reusable and attach to a target race
- Courses appear in the race calendar with a projected finish

**T1-3 — Insights tab**

- Lifetime/period stats: total distance, total runs, moving time, elevation gain, longest run, races
- Monthly mileage bar chart (race months highlighted)
- Aerobic efficiency over time (scatter + trendline)
- HR zone distribution per run (stacked bars)
- Race calendar with notable runs and PRs

**T1-4 — Weather-adjusted "effective pace"**

- Normalize each run against a reference condition (e.g. 60°F / 50% humidity)
- Show both raw and adjusted pace; explain the adjustment in the "How was this calculated?" panel

**T1-5 — Weekly digest**

- Auto-generated summary: trends this week + one concrete action item

**T1-6 — Consistency tracking**

- Honest, non-gamified: "you trained X of the last 7 days," streak of consistent weeks
- No badges, no confetti

**T1-7 — Shareable insight cards**

- Export a trend chart, projection card, or post-run card as an image (supports build-in-public GTM)

**T1-8 — Apple Health sync**

- Read-only enrichment source, iOS-only (see §4.3 for full plan and constraints)
- Backfills HR/workout data for activities Strava is missing it on
- Requires: paid Apple Developer account, custom EAS dev client, HealthKit entitlement, App Store review copy for the permission prompt

---

### Tier 2 — Deferred (needs user volume or additional infra)

- ML personalization (train on real cohort data)
- Trained-model upgrade for workout-type classification, once user corrections (T0-7) accumulate
- Predictive injury risk model
- Fitness phase auto-detection (auto-segment base / build / peak / taper blocks)
- Full adjustable scenario builder (drag mileage/workout-mix levers, compare scenarios side by side)
- Sleep integration via Apple HealthKit + sleep-vs-recovery correlation
- Heat acclimation tracking across a training block
- Altitude adjustment for elevation-heavy routes
- Goal pace tracker with statistical confidence band
- Formula changelog (versioned model changes surfaced to users)
- Public methodology page auto-linked from each insight
- Social / comparison features, coaching plans
- Garmin as an additional data source

---

## 6. Screen specifications

The app is a four-tab mobile layout, plus a first-run onboarding flow and a Settings screen reachable from the Dashboard.

### Tab 0 — Onboarding (first run only)

```
┌─────────────────────────────────┐
│ Apex                            │
│                                  │
│ Know what's actually driving    │
│ your training — not just what   │
│ happened.                       │
│                                  │
│        [ Connect Strava ]       │
└─────────────────────────────────┘
        ↓ after OAuth
┌─────────────────────────────────┐
│ Importing your history          │
│ ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░  340 / 512  │
│ (runs only — rides & hikes      │
│  filtered out automatically)    │
└─────────────────────────────────┘
        ↓
┌─────────────────────────────────┐
│ A little about you              │
│ Sex        [ Female  ▾]         │
│ DOB        [ Jan 1990 ]         │
│ Weight     [ 140 ] lb           │
│ Resting HR [ 52 ] bpm           │
│ Max HR     [ ~190 est. ] Edit   │
│  ⓘ Add your real max HR for     │
│    more accurate scores         │
├─────────────────────────────────┤
│ Units   (•) mi/°F  ( ) km/°C    │
├─────────────────────────────────┤
│           [ Continue ]          │
└─────────────────────────────────┘
```

### Tab 1 — Dashboard

```
┌─────────────────────────────────┐
│ Apex  Synced 2m ago  [7D][30D][90D]│
├─────────────────────────────────┤
│ ┌───────────┐  ┌───────────┐    │
│ │ VO2max    │  │Load status│    │
│ │ 52.4      │  │ 1.18      │    │
│ │ +0.6 ↑    │  │ Optimal   │    │
│ └───────────┘  └───────────┘    │
├─────────────────────────────────┤
│ Pace trend                      │
│   ╭──╮    ╭─╮                   │
│  ╱    ╰──╯   ╰──                │
├─────────────────────────────────┤
│ More trends                     │
│ ┌────────┐ ┌────────┐           │
│ │Heart   │ │Cadence │           │
│ │158 avg │ │172 spm │           │
│ │ ‿‿‿    │ │ ‿‿‿    │           │
│ └────────┘ └────────┘           │
│ ┌────────┐ ┌────────┐           │
│ │Temp    │ │Humidity│           │
│ │71°F    │ │64%     │           │
│ │ ‿‿‿    │ │ ‿‿‿    │           │
│ └────────┘ └────────┘           │
├─────────────────────────────────┤
│  [How was this calculated? ⌄]   │
└─────────────────────────────────┘
```

Every trend card is tappable → full-screen chart with filters.

### Tab 2 — Post-run

```
┌─────────────────────────────────┐
│ Tempo run 🔍 detected            │
│ 8.2 mi · today, 6:40am          │
├─────────────────────────────────┤
│ ┌───────────┐  ┌───────────┐    │
│ │ Avg pace  │  │  Avg HR   │    │
│ │ 7:42/mi   │  │  158 bpm  │    │
│ └───────────┘  └───────────┘    │
├─────────────────────────────────┤
│ ⚡ Session strain                │
│ 142                             │
│ Moderate-high, top 20% of last  │
│ 30 runs                         │
├─────────────────────────────────┤
│ 🌙 Recommended recovery          │
│ 36–48 hrs easy or rest          │
├─────────────────────────────────┤
│ 🏃 Suggested next workout        │
│ Easy 4mi shakeout               │
├─────────────────────────────────┤
│ Detected as: Tempo run   [Edit] │
│ 62% time in Z3–Z4, low pace     │
│ variance                        │
├─────────────────────────────────┤
│  [How was this calculated? ⌄]   │
└─────────────────────────────────┘
```

### Tab 3 — Projections

```
┌─────────────────────────────────┐
│ Race projections                │
│ [5K][10K][Half][Marathon*]      │
│ [30D][60D][90D*][180D]          │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │ [Conservative]              │ │
│ │ 3:52–3:58                   │ │
│ │ 8:52–9:05/mi avg            │ │
│ │ Realistic on current base.  │ │
│ └─────────────────────────────┘ │
│ ┌═════════════════════════════┐ │
│ ║ [Target]                    ║ │
│ ║ 3:40–3:50                   ║ │
│ ║ 8:23–8:47/mi avg            ║ │
│ ║ Needs 45–55 mpw peak.       ║ │
│ └═════════════════════════════┘ │
│ ┌─────────────────────────────┐ │
│ │ [Stretch]                   │ │
│ │ 3:25–3:38                   │ │
│ │ 7:50–8:20/mi avg            │ │
│ │ Needs 55–65 mpw, perfect    │ │
│ │ execution.                  │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ Course: NYC Marathon      [Edit]│
│ 810 ft gain adds ~4–7 min       │
├─────────────────────────────────┤
│ Projected pace by mile          │
│ ● Conservative ● Target ● Stretch│
│  ─────────────────────────       │
├─────────────────────────────────┤
│ Training requirements           │
│           Cons.  Target  Stretch│
│ Peak mpw  40–48  48–58   58–68  │
│ Speed wk  Opt.   1x/wk   2x/wk  │
│ Days/wk   4      5       6      │
├─────────────────────────────────┤
│ Fitness inputs used in model    │
│ 5K PR: 21:45 | Eff gain: +18%   │
└─────────────────────────────────┘
```

### Tab 4 — Insights

```
┌─────────────────────────────────┐
│ Insights                        │
├─────────────────────────────────┤
│ Total dist  │ Total runs        │
│ 1,424 mi    │ 152               │
│ Moving time │ Elevation         │
│ ~530 hr     │ 30,800 ft         │
├─────────────────────────────────┤
│ Monthly mileage                 │
│ ▇ ▅ █ █ ▂ ▂ █ █ ▅ ▆             │
│ (race months highlighted)       │
├─────────────────────────────────┤
│ Aerobic efficiency over time    │
│    ·  ·   ·  ·  ·               │
│  ·······················        │
├─────────────────────────────────┤
│ HR zone distribution            │
│ ▓▓ ▓▓ ▓▓ ▓▓  (stacked Z1–Z5)    │
├─────────────────────────────────┤
│ Race calendar                   │
│ 🏁 NYC Marathon — Nov 2         │
│ 🏁 Cherry Blossom 10 Mile       │
└─────────────────────────────────┘
```

### Course builder (modal / sub-screen off Projections)

```
┌─────────────────────────────────┐
│ Add a course                    │
├─────────────────────────────────┤
│ Name        [NYC Marathon     ] │
│ Distance    [26.2] mi           │
│ Elev gain   [810] ft            │
│ Race date   [Nov 2, 2026      ] │
├─────────────────────────────────┤
│ Expected conditions (optional)  │
│ Temp [52]°F   Humidity [60]%    │
├─────────────────────────────────┤
│ Key features (optional)         │
│ + Add climb at mile [ ]         │
│   Verrazzano Bridge — mi 0–1    │
│   Queensboro Bridge — mi 15–16  │
│   5th Ave climb — mi 22–23      │
├─────────────────────────────────┤
│ Upload GPX/elevation (optional) │
│  [ Choose file ]                │
├─────────────────────────────────┤
│  [ Save course ]                │
└─────────────────────────────────┘
```

Saved courses feed directly into the Projections tab — the course factor adjusts all three scenario bands and reshapes the split profile.

### Settings (reachable from Dashboard, any time)

```
┌─────────────────────────────────┐
│ Settings                        │
├─────────────────────────────────┤
│ Profile                         │
│ Sex, DOB, weight, resting HR,   │
│ max HR                   [Edit] │
│ Units            mi/°F   [Edit] │
├─────────────────────────────────┤
│ Connected accounts               │
│ Strava      Connected            │
│ Synced 2m ago      [ Sync now ] │
│                    [ Reconnect ]│
├─────────────────────────────────┤
│ Data                             │
│ [ Export my data ]               │
│ [ Delete account & data ]        │
└─────────────────────────────────┘
```

---

## 7. Data model (initial)

```
users
  id, strava_athlete_id, created_at, sex, dob, weight_kg,
  resting_hr, max_hr, max_hr_is_estimated (bool), hr_zones (jsonb),
  units_pref (mi_f | km_c), onboarding_completed_at,
  strava_access_token, strava_refresh_token, strava_token_expires_at,
  strava_connection_status (connected|needs_reauth|disconnected),
  last_synced_at, healthkit_connected (bool)   -- healthkit_connected is Tier 1

activities
  id, user_id, strava_activity_id, start_time, start_lat, start_lng,
  distance_m, moving_time_s, elapsed_time_s, elevation_gain_m,
  avg_speed_ms, avg_hr, max_hr, avg_cadence, type,
  is_run (bool), quality_flags (jsonb), created_at

activity_weather
  activity_id, temp_c, humidity_pct, dewpoint_c, wind_ms, source, fetched_at

activity_metrics        -- computed, recalculable
  activity_id, trimp, efficiency_factor, vo2max_estimate,
  adjusted_pace_s_per_km, workout_type (easy|tempo|interval|long|race),
  workout_type_source (auto_detected|user_corrected),
  computed_at, formula_version

daily_load
  user_id, date, acute_load_7d, chronic_load_28d, acwr

courses
  id, user_id, name, distance_m, elevation_gain_m, race_date,
  expected_temp_c, expected_humidity_pct, elevation_profile (jsonb),
  key_features (jsonb), created_at

projections            -- cached
  id, user_id, course_id, distance, horizon_days, scenario,
  time_low_s, time_high_s, computed_at, formula_version
```

**Note:** `formula_version` on computed tables is deliberate — it enables the Tier 2 formula changelog and lets us recompute cleanly when a model changes. `workout_type_source` exists so user corrections can later train the Tier 2 classifier upgrade.

---

## 8. Open questions (resolve during build)

1. ~~Workout type classification~~ — **resolved**: rule-based classifier, see T0-7.
2. **Riegel exponent calibration** — use the standard 1.06, or fit per-user from their own race history? Prefer per-user with fallback to 1.06.
3. **Projection cold-start threshold** — proposed 3 weeks / 12 runs minimum. Needs validation.
4. ~~Weather API choice~~ — **resolved**: Open-Meteo free tier is 10,000 calls/day, 5,000/hr, 600/min — comfortably enough for a single-user backfill (a multi-day/multi-variable request counts as a fraction of a call, so batching by date range further reduces usage). Caveat: the free tier is **non-commercial use only**, same restriction shape as Strava's personal-use terms — add to §10 if the app goes public.
5. **Strava commercial terms** — the current connection is personal-use only. A commercial app requires the Strava Developer Program API and written clarification on their AI-inference policy. **This is a launch blocker for public release, not for building** — see §10.
6. **Confidence interval methodology** — what actually generates the range on a projection? Proposed: propagate uncertainty from the fitness-fatigue model fit residuals. Needs a real spec.

---

## 9. Build sequence

**Phase 0 — Scaffold (highest-leverage, do first)**
- Expo + Expo Router project skeleton, 4-tab navigation + onboarding flow
- Supabase project, schema migration, RLS policies
- Strava OAuth flow end to end, including token refresh and reconnect handling (§4.1)
- Strava webhook subscription + nightly poll safety net (§4.2)
- Activity ingestion + backfill + normalization
- Weather enrichment job

**Phase 1 — Core analytics**
- Formula module (TRIMP, ACWR, VDOT, efficiency factor, Riegel) as a pure, unit-tested library
- Workout-type classifier (rule-based, T0-7)
- Post-workout action card
- Trend dashboard with all six trend types

**Phase 2 — Depth**
- "How was this calculated?" panels
- Data quality flags
- Settings screen (profile edit, connected accounts, data export/delete)
- Insights tab

**Phase 3 — Projections**
- Fitness-fatigue trajectory model
- Scenario generation (Conservative / Target / Stretch)
- Course builder
- Split profile + training requirements

**Phase 4 — Ship**
- Web deploy (Expo web)
- iOS build → TestFlight
- Release-readiness items from §10 as applicable to the target audience (personal use vs. public)

---

## 9b. Intelligence layer (v0.3 direction, partially shipped)

The product direction shifted after the first build review: LLM-driven analysis is now a core function, not a Tier 2 deferral. The "no ML in v1" line in §1 is superseded by this section.

**Shipped in v0.3:**
- **Coach layer (Claude).** After each workout, a single structured call to Claude (claude-opus-4-8, JSON-schema output) turns the formula engine's numbers into: a workout read in context, goal tracking with calibrated odds of hitting the target time, prioritized action items, and genuine watchouts. The model only sees engine-computed figures and must cite which inputs it used; the deterministic "How was this calculated?" layer stays untouched underneath. User supplies their own Anthropic API key (Settings), stored on-device. Direct SDK call, no orchestration framework, because this is one structured inference step.
- **Race goals.** Collected in onboarding (distance, target time, race date), editable in Settings; feeds the coach and defaults the Projections tab.
- **Personal heat sensitivity.** Insights chart: easy-run pace against temperature plus dewpoint, with a fitted slope (seconds lost per 10 combined points).
- **Personal distance fade.** Insights chart: pace against distance with the user's fitted Riegel exponent and a plain-language read of it.
- **Course library.** ~22 major races seeded in-bundle and searchable in the course builder. A scraped top-1000 database is the follow-on once there's a backend to maintain it in.

**Shipped in v0.4:**
- **Brand.** Ascending-bars mark (three bars climbing on a navy tile) as an in-app logo component beside the wordmark on the dashboard and onboarding; splash background matches the tile navy.
- **Apple Health ingestion.** Running workouts from HealthKit (via @kingstinct/react-native-healthkit, dev build required), including Watch running dynamics (vertical oscillation, ground contact time, stride length, power), cadence from step counts, HR stats, and route start points for weather enrichment. New Watch workouts auto-sync when the app foregrounds (throttled to 5 minutes); duplicates against Strava are dropped by start-time and distance proximity. Onboarding offers Connect Apple Health on iOS.
- **Workout recap notifications.** One local notification per newly synced run, composed from that run's own numbers with a significance hierarchy: longest-ever, high strain percentile, tough climate handled, load-ratio warning, else a clean recap plus the suggested next step. Toggle in Settings.
- **Population percentiles.** Form metrics only (cadence height-adjusted, vertical oscillation, ground contact time, stride-to-height) against published recreational-population distributions held in a local reference table; deliberately excludes fitness metrics. Shown per-run (Post-run, run detail) and as recent averages (Insights).
- **Next run outlook.** Open-Meteo forecast at the runner's usual start hour and location for the next scheduled plan run, or a today/tomorrow toggle (defaults to today before sunset), with Climate Score and concrete focus advice (heat pacing, wind strategy, rain probability).
- **Pre-race benchmarks.** Distance-specific checkpoint workouts (e.g. the 20-miler four weeks out) with target pace windows from the goal time and HR windows from the user's own zones, auto-marked achieved from history. In Projections.
- **Mileage-path charts.** Projections shows the weekly-mileage ramp the target scenario assumes (or the active plan's weeks); Training shows plan target vs actually-run miles per plan week.
- **Future pace projection.** Damped least-squares trend on easy-run paces extrapolated to the projection horizon, charted with history.
- **Fitness / fatigue / form chart** (classic CTL/ATL/TSB picture) on the dashboard.
- **Training plan generation and import** (item 1 below) plus a deterministic sample plan so the builder never opens blank.

**Shipped in v0.5 (hardening round from first on-device testing):**
- **Strava OAuth actually works on device**: new `strava-callback` edge function bridges Strava's registered-domain redirect back into the `apex://` scheme; callback domain is now always the Supabase host.
- **Health import correctness**: strictly running workouts (filter + per-item recheck + walking-pace guard), explicit HR statistics query per workout window, time-overlap dedup (catches Watch+Strava double records), live import progress, and a "Re-import from Apple Health" repair action.
- **Demo data never mixes with real data**: connecting Strava or Apple Health purges `demo-*` activities first.
- **Form is now classic TSB**: fitness/fatigue are normalized 42d/7d EWMAs of daily TRIMP (CTL/ATL), form = fitness − fatigue; series extend over the full history so ALL ranges show everything.
- **Fixed the female TRIMP coefficient** (0.86·e^1.67x per Banister; was using the male 0.64 multiplier).
- **Pace projection made conservative**: slope shrunk by fit R², damped, and capped at half the observed improvement.
- **Indoor runs excluded from all weather effects.** Outlook card uses device location (expo-location) with city name and explicit forecast hour.
- **Post-run redesign**: "Your last run" / "Looking ahead" sections, HealthKit heart-rate trace chart and GPS route shape for the latest run.
- **Input quality**: native date pickers, steppers for weight/resting HR, height in feet and inches.
- **Explanations**: every "How was this calculated" panel now opens with a plain-English summary above the formula.
- Next-workout suggestions analyze the recent block (days since quality/long run, easy streak) instead of repeating "rest 24 hours".

**Next (in priority order):**
1. **Trend and anomaly flagging.** A scheduled (weekly) coach pass over the full history: efficiency inflections, HR drift at fixed pace, unusual gaps, plateau detection. Surfaced as a digest.
2. **Deeper HealthKit context.** Sleep, HRV, and native VO2max feeding the coach context; HealthKit background delivery for true push-on-new-workout (currently foreground sync).
3. **Remaining ingestion surfaces.** Garmin Connect, GPX/FIT file import as the lowest common denominator behind the same `DataSource` interface.
4. **Classifier upgrade.** Once user corrections accumulate, replace classifier rules with a trained model (corrections are already persisted with `workout_type_source`).

## 10. Release readiness (path from MVP to public release)

The Definition of Done in §11 is the bar for a working personal/TestFlight build. Public release needs more:

1. **Strava commercial API approval** — apply to Strava's API Program; the personal-use connection built in Phase 0 does not cover a public app (Open Question #5).
2. **Open-Meteo commercial licence** — the free weather tier used in Phase 0 is non-commercial only; a public app needs their paid customer API (Open Question #4).
3. **Privacy Policy + Terms of Service** — required both by Apple's App Store review and by Strava's API agreement; must disclose HR/health-adjacent data handling.
4. **Health-data disclaimer** — VO2max, TRIMP, and recovery windows are statistical estimates, not medical advice; state this in-app. App Store review flags health-adjacent apps that omit it.
5. **In-app account & data deletion** — Apple requires this whenever account creation happens in-app (it does, via Strava OAuth). Covered by T0-8; must actually work before submission.
6. **Data export** — pairs with deletion for GDPR/CCPA-style compliance once usage extends beyond you personally.
7. **Apple Developer Program enrollment** — needed for TestFlight already (§0); required again for public App Store distribution.
8. **App Store Connect listing assets** — icon, per-device screenshots, description, support URL, and the privacy "nutrition label" disclosures.
9. **Crash/error monitoring** — add lightweight monitoring (e.g., Sentry) before opening to real users beyond yourself, so device-side failures are visible.
10. **Rate-limit hardening at scale** — Strava's per-app limits were sized for single-user dev testing; confirm they hold for a real user base before opening beyond a small beta.
11. **HealthKit review compliance** — only applies if T1-8 ships before public release; Apple applies extra scrutiny to HealthKit permission copy and data usage.

---

## 11. Definition of done for MVP

- [ ] User completes onboarding, connects Strava, and sees their real history within 60s
- [ ] Every run has weather data attached
- [ ] Dashboard shows six trend types, filterable by three time ranges, with visible sync status
- [ ] Every completed run produces an action card with strain, recovery window, next workout, and a detected (and correctable) workout type
- [ ] Every number in the app has a working "How was this calculated?" panel
- [ ] Bad data is flagged, not silently rendered
- [ ] User can edit their profile inputs and export/delete their data from Settings
- [ ] Runs on web and on a physical iPhone via TestFlight

This is the MVP bar. Public release requires §10 as well.
