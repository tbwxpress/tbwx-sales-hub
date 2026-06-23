# Sales-AI Autonomous Guiding System — Design Spec

**Status:** Draft for owner review (no code yet)
**Date:** 2026-06-23
**Owner:** Gavish
**Builds on:** `2026-06-23-guided-work-mode-design.md` (the Guided Work Mode `/work` rail, already live)
**Source:** 5-stream research workflow (buyer psychology, cadence science, AI next-best-action, behavioral/honesty design, codebase gap audit)

---

## 0. Executive summary (plain language)

Today the work rail records **what** the rep did (called, sent deck, marked interested) but almost never **why** a lead is hot or dead. Because the report is mostly blank, AI has nothing real to reason over — so it can't tell you where to put effort.

**The fix is a sequence, not a feature:**
1. **Capture the "why" — with taps, not typing.** When a rep logs an outcome, one row of chips appears: the objection, the lead's temperature, their money situation, and who really decides. One or two taps. No essays.
2. **Let AI order the work and recommend the next move** — using transparent math the rep and you can read ("this lead scores high because: budget confirmed +20, replied 2h ago +12, Tier-1 city +15"). The AI writes the *words* (the reply, the rebuttal); simple rules decide the *order* and *action*, so the team trusts it.
3. **Learn what actually converts** — a nightly job reads the history and tells you which objections, actions, and lead types really close, then sharpens the scoring automatically.

Everything is **additive and reversible** (Free mode and the current rail keep working untouched), **explainable** (no black box), and **frictionless** (≈2 extra taps, only on the outcomes that matter).

**The payoff:** every card becomes a decided, scripted next move; the rail surfaces the most-likely-to-close lead first; and you see exactly which leads are slipping and which reps need coaching.

---

## 1. Design principles (non-negotiable)

1. **Additive & reversible.** New columns are nullable; new behavior sits behind the existing Guided-Mode experiment. Free mode (`work_mode='free'`) is never affected.
2. **Capture the WHY as structured data, not prose.** A rep who must type will skip it. Every high-value signal is a **chip tap** (enum), never required free text.
3. **Truth is the lazy path.** The honest-negative outcome ("Not interested / Lost") is the *fastest* button (one tap, no extra fields). The optimistic outcome ("Interested / Advanced") costs *one* confirming reason-tap. This kills "happy ears" inflation by design — never punish honesty.
4. **Rules decide order & action; the LLM only writes words.** Scoring, ranking, routing, and the next-best-action *choice* stay deterministic, explainable integer math. The LLM is scoped to language tasks only (summarise thread, draft reply, classify objection, write the rebuttal). This preserves trust for an inexperienced team and keeps cost near-zero.
5. **Graceful degradation.** Every AI call has a deterministic fallback (the current behavior). If the LLM key/quota dies, the rail never breaks.
6. **Explainability over accuracy theatre.** A score built on a blank ad-form is a confident lie. Scores show as **provisional** (grey) until a human verifies on the call, then flip to **trusted**.
7. **Minimum-signal contract.** Cap rep effort at ~2 taps per meaningful touch. Per TOUCH = outcome (have) + sentiment (1 tap) + objection-or-next-step chip (1 tap, only when the outcome implies one). Per LEAD = everything else is *derived*, never asked again.

---

## 2. The data-model upgrade (the linchpin)

All new capture funnels through the existing single chokepoint:
`OutcomeBar.tsx` → `POST /api/work/outcome` → `applyWorkOutcome()` (in `src/lib/work.ts`) → `insertWorkEvent()` (in `src/lib/db.ts`). One component, one function — minimal surface.

### 2.1 New `work_events` columns (additive, nullable)

| Column | Type | Captured how | Purpose |
|---|---|---|---|
| `connected` | INTEGER 0/1 | derived from action (`no_answer`/`no_response`=0, else 1); 1-tap override on call cards | Connect-rate per lead & per rep — the #1 missing operational predictor (58% no-answer today is invisible) |
| `objection` | TEXT enum | 1-tap chip on soft-no outcomes | The "why" behind a stall — powers rebuttals + learning |
| `sentiment` | TEXT enum (`hot`/`warm`/`cool`/`cold`) | 1-tap strip on every outcome (defaults neutral; skip allowed) | Lead temperature trend → momentum |
| `next_step` | TEXT enum | 1-tap chip on positive/advance outcomes | What the buyer committed to next |
| `signals` | TEXT (JSON) | chips on the "Interested → qualify" handoff | The qualification vector (budget/city/decision-maker/funds) |
| `confidence` | INTEGER 1–3 | optional 1-tap on optimistic outcomes | Flags zero-reason "interested" as low-confidence (anti happy-ears) |

### 2.2 New `leads` columns (derived cache; additive, nullable)

| Column | Type | Purpose |
|---|---|---|
| `score` | INTEGER 0–100 | Propensity score (recomputed each outcome) |
| `score_reason` | TEXT (JSON array) | The explainable contributors (`["budget ok +20","replied 2h ago +12"]`) |
| `temperature` | TEXT (`warming`/`flat`/`cooling`) | Momentum direction |
| `next_action` | TEXT | The recommended next-best-action key |
| `buyer_persona` | TEXT enum | The master routing key (see 2.3) |
| `capital_readiness` | TEXT enum | Funds reality (see 2.3) |
| `decision_maker` | TEXT enum | Who approves (the silent veto) |
| `preferred_language` | TEXT enum | For same-language routing + asset language |
| `closed_outcome` | TEXT | Stamped at terminal close → makes the log learnable |
| `scored_at` | TEXT | Freshness of the score |

> `work_events` stays the append-only source of truth; the `leads` columns are a derived cache for fast ordering and display.

### 2.3 The chip taxonomies (the exact enums)

**Buyer persona** (1 tap, on first qualify): `first_timer` · `passive_investor` · `existing_fnb` · `side_income_nri` · `family_funded`
*(Each has a known dominant fear → AI pre-empts it and picks the right proof asset.)*

**Capital readiness** (1 tap, on qualify): `funds_ready` · `needs_loan` (MUDRA/bank) · `arranging` · `not_yet` · `unknown`

**Decision-maker** (1 tap, auto-prompted on a "family approval" objection): `self` · `spouse` · `father_family` · `business_partner` — plus a derived `influencer_engaged` boolean (have we actually talked to them yet?).

**Objection** (1 tap, on soft-no): `roi_doubt` · `location_risk` · `brand_unknown` · `support_fear` · `capital_not_ready` · `needs_family_approval` · `saturation` · `just_exploring`

**Next step** (1 tap, on positive/advance): `will_send_deck` · `booked_call` · `wants_visit` · `comparing_options` · `awaiting_family`

**Sentiment** (1 tap, every outcome): `hot` · `warm` · `cool` · `cold`

**Qualification vector** (`signals` JSON, on qualify): `{ budget_ok, city_locked, decision_maker, funds_ready }` (each yes/no/unknown).

**(Phase 3) Commitment milestones** (closer ticks as the BUYER crosses them — measures buyer depth, not rep activity): understood-economics · saw/visited-outlet · family-aligned · funds-confirmed · location-shortlisted · token-discussed.

**(Phase 2) Asset sent** (what `deck_sent` actually means — the trust ladder): brochure/deck · outlet-video · owner-testimonial · unit-economics-sheet · site-visit-offer · live-billing-proof (+ viewed/not where WhatsApp media status is available).

### 2.4 Capture UX rules (friction inversion)

- **Honest-negative outcomes** (`not_interested`, `lost`, `no_response`): single tap, **no required fields** — the fastest buttons on the screen. (A reason chip is offered, never blocking.)
- **Optimistic outcomes** (`interested`, `advanced`): require **one** confirming reason/sentiment tap before it counts as a clean qualify/handoff. A zero-reason "interested" is flagged `confidence=low`, not counted as a clean qualify.
- **Soft-no outcomes** (`not_ready`, `going_cold`, `callback`): reveal the inline objection chip row (replaces the buried free-text note).
- Free-text note stays as an optional escape hatch — never the primary path.
- **(Phase 2) Voice-note option:** a rep who hates tapping records a 5s voice note; a cheap LLM parses it into the same chips (objection + sentiment + next-step).

---

## 3. The AI decision layer

### 3.1 Lead scoring (deterministic, greenfield `src/lib/scoring.ts`)

> Note: `scoring.ts` is referenced in config but **does not exist yet** — clean slot, no conflict.

`leadScore(lead, signals)` → `{ score: 0–100, reasons: string[] }`, composed of:
- **Qualification fit** — budget/model + timeline + experience + city-tier (from the verified `signals` vector, falling back to normalized ad-form fields).
- **Behavioural boost** — reply frequency + recency + latency (from inbound message timestamps; *out-predicts* ad-form fields and is robust when they're blank).
- **Momentum** — sentiment trend + status moving forward over last 7d.
- **Decay** — days since last meaningful touch.
- Each contributor returns an integer + a human reason string → surfaced on the card.

**Provisional vs trusted:** until a human verifies qualification on the call, the score shows grey/"provisional" so a blank ad-form never looks certain.

### 3.2 Within-bucket ordering (the core, lowest-risk change)

Keep the existing buckets (open-window > fresh > callback-due > interested/stalled > overdue) — they correctly answer *when/which-channel*. Replace only the thin `withinBucketSort()` tiebreak in `work.ts` so that **inside** a bucket, leads sort by `score`. Today a budget-confirmed Tier-1 lead sorts identically to a tyre-kicker; this fixes that. Surface `score_reason` by extending the existing `why_now` slot on `WorkCard`.

### 3.3 Next-best-action recommender (rules decide, LLM writes words)

Add `nba: { action, reason }` to the `WorkCard`. Action ∈ `{ reply_now_whatsapp, call_now, send_deck, book_visit, nurture_drip, drop_to_lost }`. Decision rules:
- window open → `reply_now_whatsapp` (only free + allowed channel)
- window closed + HOT/interested → `call_now`
- qualified + no deck sent → `send_deck`
- FINAL_NEGOTIATION + warm → `book_visit`
- 3+ no-answers OR `just_exploring` → `nurture_drip`
- negative-reply detected (reuse `isNegativeReply`) + low score → suggest `drop_to_lost`

The NBA **pre-highlights the recommended outcome button** so a novice does the right thing by default. The LLM only writes the words *for* that action (reply draft, deck message, the objection-specific rebuttal).

### 3.4 Best-time-to-contact (free, high impact on the 58% no-answer)

Bucket each lead's inbound-message hours into a simple distribution → show "usually messages ~9pm, call after 8pm" on call cards. Extend callback capture to accept an optional **time** (not just date) so the rail re-surfaces at the right *hour*, not midnight (`futureDateOr()` → datetime `next_followup`).

### 3.5 Per-lead LLM reasoner (clone the existing pattern)

New `POST /api/work/reason` modeled exactly on `src/app/api/inbox/ai-suggest/route.ts` (same KIE gateway, same guardrails — never invent numbers/locations, only the real ₹/royalty/payback facts — same graceful fallback). Input `lead_row`; reads work_events history + thread + the qualification vector; returns `{ temperature, next_action, talking_points[3], risk_flag, draft_opener }`. `WorkCard` swaps its static `talkingPoints()` for this when present, falls back to current heuristics. Cache per `(lead_row, last_message_id)` so it isn't re-billed on every view.

### 3.6 Cadence & speed (the operational backbone)

- **Speed-to-lead clock:** replace the single "fresh" bucket with an age-weighted score (green <5 min → amber 5–30 → red >30) + a "New lead just arrived — call now" interrupt so batching is impossible. Track `speed_to_first_dial_seconds` per lead and per rep.
- **Minimum-attempt cadence:** add `attempt_count` + a cadence ladder (call → WhatsApp same day → call next-day AM → call PM → WhatsApp day 3 → call day 5). A lead **cannot** auto-die on non-contact before ~5–6 spaced attempts; it re-enters the queue at the scheduled next touch. Show "Attempt 2 of 6" on the card. Explicit rejection (`not_interested`/`lost`) still allows a hard manual kill.
- **India windows + call→WhatsApp auto-sequence:** bias dial-priority into ~11am–12pm / ~4–5pm / ~8–10pm; outside windows bias the conveyor to open-WhatsApp-window async work. On **every** `no_answer`, auto-stage a one-tap WhatsApp template send (re-opens the 24h window, flips the lead to "open-window 1-tap reply").

---

## 4. The learning loop (closes the system)

- **Stamp signals at close:** on terminal close (`recordLeadClose` path in `applyWorkOutcome`), write `closed_outcome` + the score/signals as-of-close → makes the (signals → won/lost) join trivial.
- **Nightly recompute:** a cron (`/api/cron/*` + host crontab already exist) joins `work_events` → terminal status and computes empirical conversion rates per `(bucket, score-band, objection, first-action, persona)`. Output a small `learned_weights` JSON the score reads.
- **Cold-start safety:** ship as an **owner-only report first** ("passive investors close 3× — buy more of that lead type"; "price objections that got an ROI deck within 24h convert 3×"). Promote to **live weights** only after a few weeks of labelled data. Deterministic SQL = explainable + free; optional LLM writes the weekly natural-language digest.

---

## 5. Motivation & honesty (tuned for an inexperienced India team)

India team research is consistent: **team-based + personal-best mechanics beat individual leaderboards**, and a cutthroat "who closed most" board *backfires* into inflation + churn. So:
- Keep the rep-facing CadenceHeader **personal** (your rings, your streak) — no public ranking.
- Add: a **personal-best** chip ("best week: 62 talks"), a single shared **team daily goal** bar (collective conversations), and an **honesty streak** that rewards consistently capturing reasons + honestly clearing dead leads. The system literally celebrates honest negatives ("2 dead leads cleared — clean day").
- **Owner panel reframe:** recast `stalled_hot` / `untouched` / `last_action_at` from raw per-agent counts into **"leads needing help"** action cards ("X HOT going cold — reassign/coach"). A per-rep "qualify accuracy" trend (interested→won rate) is **owner-only** coaching input, never exposed rep-to-rep. Punitive dashboards are the #1 cause of the inflation we're trying to remove.
- Keep the humane dials cap (120–200) framed as **"enough," not "more"** + a "you're done — good day" end state to prevent burnout.

---

## 6. India-specific plays (baked into the above)

- **Capital readiness out-predicts timeline** → serve a MUDRA/loan explainer to `needs_loan` buyers instead of letting them stall silently.
- **Silent veto** → on `needs_family_approval`, NBA = "get the influencer on a 3-way call + send a vernacular outlet video."
- **Trust ladder is media-first** → outlet videos + vernacular testimonials + nearest-outlet site-visit offer beat decks; track which asset moved the lead.
- **Same-language routing** for tier-2/3 (Jaipur/Mohali/Kharar/Trichy) — right-language rep + right-language asset; an English cold-call to a Kharar lead loses them in 30 seconds.
- **Call windows** ~11am–12pm / 4–5pm / 8–10pm; outside peaks bias to WhatsApp.
- **Speed-to-lead** — a fresh lead is unmissable; you pay for every one.

---

## 7. Phased roadmap (mapped to the codebase)

| Phase | Goal | Concrete changes | Files | Effort |
|---|---|---|---|---|
| **0 · Quick wins** | Make the rail intelligent today | Greenfield `scoring.ts`; wire `score` into `withinBucketSort()`; show `score_reason` in `why_now`; `connected` column (derive from action); auto-stage WhatsApp template on every `no_answer`; objection chip on soft-no | `lib/work.ts`, `lib/db.ts`, `components/work/{OutcomeBar,WorkCard}.tsx` | S |
| **1 · Honest reporting** | Turn each touch into a feature row | Additive `work_events` columns (objection/sentiment/next_step/signals/confidence/connected); the tap-not-type chip layer; capital-readiness + decision-maker + persona on qualify; friction inversion ("truth is lazy") | `lib/db.ts`, `lib/work.ts` (`ApplyOutcomeInput`→`insertWorkEvent`), `components/work/OutcomeBar.tsx`, `api/work/outcome/route.ts` | M |
| **2 · Decision layer** | Tell the novice the next move | NBA recommender on the card; `POST /api/work/reason` (clone `ai-suggest`); best-time-to-call + datetime callbacks; momentum/decay detector; speed-to-lead clock + min-attempt cadence | `lib/work.ts`, `api/work/reason/route.ts`, `components/work/WorkCard.tsx` | L |
| **3 · Learning + motivation** | Learn what converts; keep the team honest & motivated | Nightly conversion recompute → `learned_weights`; signals snapshot at close; persona-segmented analytics; team-goal + personal-best + honesty-streak; owner panel "leads needing help" reframe + per-rep qualify-accuracy (owner-only) | `api/cron/*`, `lib/work.ts`, `components/{CadenceHeader,OwnerWorkPanel}.tsx`, `app/dashboard` | L |

---

## 8. Risks & guardrails

- **Garbage-in:** scores stay **provisional** until human-verified; ingest normalizes free-text ad-form fields into enums with a confidence flag.
- **Over-automation:** ordering is explainable integer math; the system **never auto-kills** a lead (only enforces minimum cadence + suggests `drop_to_lost`).
- **Happy-ears inflation:** honest-negative = 1 free tap; optimistic costs a reason tap; zero-reason "interested" flagged low-confidence and down-weighted in the closer queue.
- **Rep morale:** no cutthroat leaderboard; owner panel is a coaching/help lens, not a shame board; rep view stays personal.
- **LLM availability:** every AI call degrades to the current deterministic behavior (already the pattern in `ai-suggest`).
- **Cold-start:** learning ships owner-only first; live weights only after weeks of labelled data.

---

## 9. Open decisions for Gavish (before/while building)

1. **Persona/objection wording in Hinglish?** Should chips read in simple Hindi/Hinglish (e.g. "Paisa ready", "Ghar pe poochna hai") for the team, or English? (Recommend Hinglish labels for adoption.)
2. **Voice-note capture (Phase 2)** — worth it, or are chips enough? (Adds a Gemini parse step.)
3. **Which LLM** for the reasoner — keep the KIE `gpt-4o-mini` gateway, or the free Gemini Flash you already use elsewhere? (Recommend Gemini Flash for $0, KIE as fallback.)
4. **Asset library** — do we have the outlet videos / vernacular testimonials / unit-economics sheet ready to attach to the trust-ladder NBA? (If not, that's a content task in parallel.)
5. **Min-attempt count** — confirm ~6 spaced attempts before a non-contact lead can rest (vs your gut from the field).
6. **Capital-readiness as a hard gate?** Should `not_yet`/`unknown` leads be auto-deprioritised, or just down-weighted? (Recommend down-weight, not hide.)

---

*This spec is deliberately code-free. On approval, Phase 0 is the recommended first build (visible in a day, near-zero risk), with the capture foundation (Phase 1) immediately after — since every later AI capability depends on the "why" being in the data.*
