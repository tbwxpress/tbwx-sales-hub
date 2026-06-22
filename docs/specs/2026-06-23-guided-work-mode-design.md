# Guided Work Mode — Design Spec

**Date:** 2026-06-23
**Status:** Approved design → ready for implementation planning
**Product:** TBWX Sales Hub (`sales.tbwxpress.com`)
**One line:** A guided "work rail" that drives an inexperienced sales team to continuously work the single highest-value action, captures that work in-system, and keeps them motivated — while experienced reps keep full ownership.

---

## 1. Problem & goal

A deep forensic audit of production (2,628 leads) showed the operation isn't bleeding from lack of leads — it's bleeding because **the work lives outside the system, drifts, and has no cadence**:

- **First human response is broken/invisible:** only 165 of 763 tracked leads ever got a measured first response; 98% of outbound is auto-templates; agents call + WhatsApp from personal numbers, so the real selling is off-system.
- **A graveyard that's half-alive:** 1,201 leads (45.7%) sit in `NO_RESPONSE`, but **594 of them actually replied** — recoverable, abandoned.
- **No follow-up discipline:** **1,424 follow-ups overdue** (90% of every scheduled follow-up); the tasks/reminder feature is dead (13 rows, 8/9 overdue).
- **Wildly uneven effort:** one closer (Happy) does ~all the work (~178 actions/day); another (Anmol) hoards HOT leads (28 stalled, 106 waiting on a reply) and writes 3 notes/week; a telecaller (Apurva) has **148 leads never contacted**.
- **Channel mismatch:** 58% of calls are no-answer; WhatsApp is where leads engage — but the **WABA 24-hour window** blocks free-text after 24h, which is why agents flee to personal numbers.

**Goal:** turn the agent experience into a single-focus, can't-skip, **guided conveyor** that (a) decides what to do next, (b) forces the action + a structured outcome that auto-schedules the next step, (c) pulls calls and WhatsApp into the system, and (d) keeps a novice team in continuous motion — without spamming leads. Experienced reps opt out into the full app.

**Non-goals (v1):** redesigning the ad funnel, pulling closers' *personal* WhatsApp content on-system, deep gamification, a fully configurable playbook UI, auto load-rebalancing of historical backlog.

**Experiment posture (non-negotiable):** This ships as a **reversible, opt-in experiment layered on top of today's app — nothing existing is removed or degraded.** **Free mode is exactly the current SalesHub**, unchanged. `work_mode` defaults to **`free` for everyone**; the owner opts individual agents into Guided to experiment and flips them back instantly. Guided and Free are two *drivers over the same shared data* (leads, statuses, messages, notes) — never separate systems — so switching modes is lossless and loses no history. All schema changes are additive; there are **no destructive migrations** and no behavior change for anyone left in Free.

---

## 2. Core concept — two independent dials

The whole design rests on separating two per-agent settings the **owner** controls:

| Dial | Values | Decides |
|---|---|---|
| **Role** | `telecaller` \| `closer` | *What kind of work* → card type, queue order, playbook, whether the lead routes out |
| **Mode** | `guided` \| `free` | *How much the app drives them* → Guided = forced conveyor + cadence; Free = today's full app + ownership |

This yields four first-class combinations:

| | **Guided** (on the rail) | **Free** (ownership) |
|---|---|---|
| **Telecaller** | call/WhatsApp → log → next (Apurva, Mukul) | rare |
| **Closer** | WhatsApp/call → outcome → next (a *novice* closer, e.g. Anmol) | full app (Happy) |

Guided is **not** "the telecaller mode" — it's "the cadence mode." A novice closer runs on the same rail with the closer card + closer queue. Promotion is one switch: **Guided → Free** (and the reverse is a coaching lever for a slipping closer).

---

## 3. The pipeline — a loop, not a one-way street

```
        NEW LEADS (Meta / IG ads)
                 │  round-robin
                 ▼
        TELECALLERS  (Guided)  ── qualify, fast first touch
                 │  outcome = "Interested" → least-loaded closer
                 ▼
          CLOSERS  (Free or Guided)  ── own & close the deal
                 │
                 ├── outcome = "Won" → CONVERTED 🎉
                 └── goes cold ──▶ back to TELECALLER "Re-warm" queue
                                        │ re-engaged
                                        └──▶ back to the ORIGINAL closer
```

- **Forward handoff:** telecaller logs **Interested** → lead routes to the **least-loaded closer** (round-robin fallback), status → `CALL_DONE_INTERESTED`/`HOT`, closer notified the same minute. (This is the fix for "no fast human response" and "HOT leads stalling unassigned.")
- **Reverse handoff (nurture loop):** a closer working a cooling lead logs **"Going cold → hand to telecaller"** → lead reassigns to a telecaller's **Re-warm** queue (call-first), status → `DELAYED`. Telecaller re-engages → logs **Re-engaged** → routes **back to the original closer**, status → `HOT`.
- **Anti-rot rule (owner-configurable):** a closer lead with **no engagement for 7 days** surfaces in the closer's rail with a "work it or hand back" prompt, and **auto-bounces** to the telecaller Re-warm pool after the threshold. (This single rule would have prevented Anmol's 28 stalled HOT from ever existing.)

Ownership/credit: `assigned_to` always reflects *who is working it now*; conversion credit goes to the closer who logs `Won`. Full ownership history lives in `assignment_log` and is shown on the card's lifecycle strip (§5).

---

## 4. The priority engine — "what matters," role-tuned and window-aware

The engine returns each agent **their** slice, ordered so the next card is always the highest-value, *allowed* action. Computed fresh per request (no precomputed queue tables — instant at this data size, always current). Each lead is locked to one agent, so the same lead is never served to two people (fixing the duplicate-worked problem).

**The WABA rule that shapes everything:** a customer message opens a 24h window (resets each inbound); inside it you can free-text; outside it you can send **only templates**. **We do NOT spam reactivation templates.** Instead the engine treats the **open window as the top priority signal** (it's both the highest-intent moment and the only time WhatsApp is allowed *and* free), and uses **calls** for everything else.

**Telecaller (Guided) queue order:**
1. 🟢 **Open-window WhatsApp reply** — lead messaged within 24h, unanswered (respond now, countdown).
2. 🆕 **Fresh new lead** — assigned, never contacted → first touch (call; WhatsApp if they've engaged).
3. ☎️ **Callback due** — a callback time has arrived.
4. 🔥 **Interested, not yet called.**
5. ⏰ **Oldest overdue** needing a call.

**Closer (Guided) queue order:**
1. 🟢 **Open-window WhatsApp reply** — customer waiting, window open (HOT / soonest-closing first).
2. 🆕 **New qualified handoff** — just routed from a telecaller (first closer touch).
3. ♻️ **Re-engage** — a previously-replied lead that went quiet (call).
4. 🔥 **Stalled HOT** — HOT/interested, no contact 3+ days (can't be skipped).
5. ⏰ **Oldest overdue follow-up** (call).

Each item carries: lead context, qualification, **why-now reason**, window state, and the allowed primary action.

---

## 5. The guided card (the heart of the UI)

One card at a time, full-focus. Top→bottom:

1. **Lifecycle strip** (context without leaving the rail), built from `created_time` + `campaign`, `lead_status_changes`, `assignment_log`, last call/message:
   > 📥 Came in **12d ago** (IG ad) → ✅ Qualified by **Apurva 10d** → 👤 **Anmol 10d** → 📄 Deck **9d** → 💬 Last contact **6d ago**  · _[expand ▾]_
   Expand → full chronological trail (status moves, calls, replies, handoffs incl. the nurture loop).
2. **Who + qualification:** name, city, status pill, 🔥 if HOT · *model ₹3-4L · "within 30 days" · experience*.
3. **Why now:** the reason string + last inbound quote (e.g. *"replied 2h ago: 'what's the investment?'"* / *"new — first touch"* / *"9d overdue"*).
4. **Window-aware primary action:**
   - **Window OPEN** → **WhatsApp reply** with AI-suggested draft pre-filled (reuse `/api/inbox/ai-suggest`), one tap to send, live 24h countdown. (For *both* roles.)
   - **Window CLOSED / cold** → **📞 Call** (click-to-dial) + 3 talking-point prompts (for novices). No reactivation-template button.
   - Secondary always available: the other channel + "send deck/info" (a captured SalesHub template) when relevant.
5. **Forced outcome bar** (the only way to advance) + optional one-line note + an optional **"✓ also messaged on WhatsApp"** toggle (off-system touches are recorded as a flag, not scored).
6. **Cadence header** (persistent): `Today: 18 cleared · 12 left · 🎯 target 30 · 🔥 4-day streak`.

Telecaller vs closer cards differ only in default channel emphasis, queue, talking-points vs deal-context, and outcome set.

---

## 6. Outcomes → playbook (the behavior engine)

Picking an outcome is the **only** way to advance; each one auto-applies status + next follow-up (+ routing). This is what kills the 1,424-overdue problem — every action ends with a scheduled next action. Sensible defaults now; admin-tunable later.

**Telecaller outcomes:**
| Outcome | Auto-effect |
|---|---|
| Interested → qualify | status `CALL_DONE_INTERESTED`/`HOT`; **route to least-loaded closer**; notify closer |
| Callback | set callback time; re-queue to **same telecaller** at that time |
| No answer | attempt +1; follow-up +1d; after 3 → suggest WhatsApp / `NO_RESPONSE` |
| Not ready | `DELAYED` + follow-up +N days |
| Deck/info sent | `DECK_SENT` + follow-up +1–2d |
| Not interested | `LOST` |

**Closer outcomes:**
| Outcome | Auto-effect |
|---|---|
| Advanced / replied | keep stage; follow-up +1–2d |
| Sent deck/quote | `DECK_SENT`/negotiation; follow-up +2d |
| Booked visit/call | schedule; follow-up at that time |
| Not ready | `DELAYED` + follow-up +N days |
| No response | follow-up +1d; after N → re-engage bucket |
| **Going cold → telecaller** | reassign to telecaller **Re-warm** queue; status `DELAYED` |
| **Won 🎉** | `CONVERTED`; celebration; notify owner |
| Lost | `LOST` |

---

## 7. Mode mechanics

- **Schema:** `users.work_mode` (`guided`\|`free`, default `free`), `users.agent_role` (`telecaller`\|`closer`; may derive from existing `is_telecaller`/`is_closer` flags), `users.daily_target` (int).
- **Owner control (for everyone):** Admin → Agents — the owner sets **each agent's** Role + Mode + daily target and flips anyone Guided↔Free anytime (lossless, instant). The team-wide **default is Free**, with a one-click **"all to Free" kill-switch** to pause/end the experiment for everyone at once. (Admin-only, already gated.)
- **Guided agents:** post-login land on **`/work`**; nav stripped to the rail (no dashboards to idle on). They can open a lead's full detail from the card, but the rail is home.
- **Free agents:** unchanged — Today / Inbox (with the new triage cockpit) / Leads / Pipeline.
- **Promotion / coaching:** Guided→Free when a rep proves out; Free→Guided to re-impose cadence on a slipping closer.

---

## 8. Visual design & motivation (make the cadence *feel* good)

For an inexperienced team, the rail only works if it's **immersive, satisfying, and motivating** — "operator pride," not childish gamification. On the existing warm brown/gold dark-luxe brand, but Work Mode is a calmer, focused **cockpit**.

**Visual principles**
- **One thing, big and clear:** a single centered card, generous spacing, one obvious primary action, large tap targets (mobile-first — agents work on phones).
- **Calm base, warm urgency:** dark bark background; gold for the primary action; color *temperature* signals priority (gold = act, amber = window-closing, red = closed/stalled) — never noisy.
- **Satisfying motion:** card slides out + a crisp **"+1"** on each cleared lead; the progress ring fills smoothly; subtle confetti only on **Won**. 150–250ms, `prefers-reduced-motion` respected.
- **Always-visible momentum:** the cadence header (cleared / left / target / streak) is pinned, so progress is felt continuously.

**Motivation mechanics (v1 = tasteful core; depth deferred)**
- **Progress ring + daily target** ("18 / 30") — a clear, attainable finish line each day.
- **Streaks** — consecutive days hitting target ("🔥 4-day streak"); small, encouraging.
- **Momentum / "on a roll"** — a gentle combo indicator when clearing several quickly.
- **Cleared-counter + micro-celebration** — the "+1" and a soft tick on every outcome; a **Won** gets confetti + an owner ping.
- **End-of-day card** — "You cleared 31 today · 3 qualified · 1 won 👏" (and a quiet "you're caught up 🎉" when the priority buckets empty).
- **Gentle team leaderboard** (read-only, today's cleared/qualified) — visible to owner; opt-in for agents. (Deeper gamification, badges, idle-timer nudges → deferred to v1.1.)

The motivation is wired to the **right** behaviors (cleared cards with real outcomes, qualified handoffs, on-system WhatsApp replies, Wins) so what gets celebrated is what moves revenue.

---

## 9. Owner cockpit (accountability for free)

A live **Work panel** (in `/admin` and/or `/dashboard`), fed by the same `work_events` log:
- Per agent: **in Work Mode now? · cleared today · queue depth · stalled-HOT · untouched · last action time.**
- Pipeline between stages: **qualified handoffs today**, re-warm bounces, Wins.
- This is exactly what surfaces "Anmol hoarding / stalled" and "Apurva idle / 148 untouched" — the dashboard accountability the audit demanded, with no extra build.

---

## 10. Data model (minimal additions)

- **`users`:** add `work_mode`, `agent_role`, `daily_target`.
- **`work_events`** (new): `id, user_id, lead_row, role, channel ('call'|'whatsapp'|'template'|'system'), action, outcome, also_whatsapp (bool), created_at`. Powers cleared-today / streaks / owner panel / future analytics; the single source of "did the work happen."
- **Reuse (no new tables):** `lead_status_changes` (lifecycle + playbook audit, `source='work'`), `assignment_log` (handoff history), `next_followup` (scheduling + re-engage), `sla_metrics` (redefined below), `notifications` (handoff + Won alerts), `call_logs`, `messages`, `pipeline_stages`.
- **Dead features to avoid:** `lead_delegations` (0 rows) and `tasks` (abandoned) — build reminders on the `work_events` + `next_followup` + notifications path, not these.

---

## 11. API & component surface

**API**
- `GET /api/work/queue?limit=1` → the next card(s) for the session agent (priority engine; role+mode+window aware). Returns lead context, lifecycle, why-now, window state, allowed actions, outcome set.
- `POST /api/work/outcome` → `{ lead_row, outcome, channel, note?, also_whatsapp? }` → applies the playbook (status + follow-up + routing), writes `work_events` + `lead_status_changes` + assignment, returns the next card.
- `GET /api/work/stats` → cleared today / target / streak / queue depth (header + owner panel).
- `PATCH /api/admin/agents/:id` → set role / work_mode / daily_target (admin-only).
- Routing helpers: `pickLeastLoadedCloser()`, `pickTelecallerForReWarm()`.
- WhatsApp send + AI-suggest + template reuse the **existing** `/api/inbox/*` endpoints (incl. the server-side 24h enforcement).

**UI**
- `/work` route (Guided landing). Components: `WorkCard`, `LifecycleStrip`, `WindowAwareAction` (reuses `WindowCountdown`, `useNow`, AI-suggest, template picker), `OutcomeBar`, `CadenceHeader` (progress ring / streak), `WonCelebration`.
- Admin → Agents: Role/Mode/target controls.
- Owner `WorkPanel` on `/dashboard` (or `/admin`).
- **Heavy reuse** of the inbox triage work already shipped (window countdown, awaiting/negative detection, AI-suggest, templates, status PATCH).

---

## 12. SLA, re-defined

"First response" must count **the first human call or first human WhatsApp**, not just a SalesHub message (the old metric understated reality because the work was off-system). `sla_metrics.first_response_at` is set on the first logged **call** or first human reply — which the rail now forces into the system. Implemented **additively** (first-response simply becomes the earliest human touch across channels); existing SLA reports keep working unchanged.

---

## 13. Scope

**v1 (this build):** Role × Mode + owner toggles; the priority engine (both role queues, window-aware, no spam); the guided card (lifecycle strip, window-aware call+WhatsApp, forced outcome); the playbook; forward + reverse handoffs + 7-day auto-bounce; cadence header with progress/target/streak + Won celebration + end-of-day card; the owner Work panel; SLA redefinition. **All additive and reversible — Free mode is today's app verbatim, and the experiment defaults off (Free) for every agent.**

**Deferred (v1.1+):** deep gamification (badges, idle-timer nudges, rich leaderboard), fully admin-configurable playbook UI, auto load-rebalancing of the historical backlog, pulling closers' personal WhatsApp on-system, per-agent target analytics.

---

## 14. Success metrics (how we'll know it worked)

- First-response time (calls counted) ↓ from ~days to hours; % leads with a same-day human touch ↑.
- "Awaiting our reply" backlog ↓ (from ~203); overdue follow-ups ↓ (from 1,424); stalled-HOT → ~0.
- Untouched leads → ~0 (Apurva's 148 cleared); per-agent activity variance ↓ (no single-person dependency).
- On-system WhatsApp replies ↑ (open-window moments captured); calls logged ↑.
- Re-warm loop in use (cold closer leads recycled, not dead); conversion rate ↑ from 0.6%.

---

## 15. Risks & open questions

- **WABA limits are immovable** — the rail can't free-text after 24h; it leans on calls + open-window replies (accepted; no spam).
- **Off-system personal WhatsApp stays invisible** — mitigated by making in-system the easiest + scored path; tracked only as a flag.
- **Adoption** — Guided must feel *helpful*, not punitive; motivation design (§8) is load-bearing. The Free escape + promotion path keeps it from feeling like surveillance.
- **Click-to-dial / call logging** depends on agents acting on the prompt; the forced-outcome gate is the enforcement.
- **Open default confirmed:** re-warm → original closer (least-loaded fallback); auto-bounce at 7 days (owner-configurable, can be off); off-system WhatsApp not scored.
