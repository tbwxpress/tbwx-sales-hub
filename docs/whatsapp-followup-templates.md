# WhatsApp Follow-Up Templates — Submit in Meta Business Manager

Go to: https://business.facebook.com → WhatsApp Manager → Message Templates → Create Template

---

## Template 1: `followup_value_hook`

- **Category:** Marketing
- **Language:** English
- **Header:** None
- **Body:**

```
Hi {{1}}, thanks for your interest in The Belgian Waffle Xpress franchise!

Here's a quick look at what our partners earn — average ROI within 6 months, low setup cost, and full brand support from Day 1.

Would you like to know more?
```

- **Buttons (Quick Reply):**
  - Button 1: `Yes, tell me more`
  - Button 2: `Not right now`

- **Parameter {{1}}:** Lead's first name

---

## Template 2: `followup_social_proof`

- **Category:** Marketing
- **Language:** English
- **Header:** None
- **Body:**

```
Hi {{1}}, quick update — our newest franchise partner launched recently and started earning within 45 days.

With 25+ outlets across India, TBWX is one of the fastest-growing waffle brands. We'd love to help you start your own outlet.

Interested in a similar setup in your city?
```

- **Buttons (Quick Reply):**
  - Button 1: `Yes, let's talk`
  - Button 2: `Maybe later`
  - Button 3: `Not interested`

- **Parameter {{1}}:** Lead's first name

---

## Template 3: `followup_last_chance`

- **Category:** Marketing
- **Language:** English
- **Header:** None
- **Body:**

```
Hi {{1}}, this is a final check-in from The Belgian Waffle Xpress team.

We're actively onboarding franchise partners this quarter and slots are filling up. If you'd like to explore the opportunity, just tap below — otherwise, no worries at all. We won't message you again.
```

- **Buttons (Quick Reply):**
  - Button 1: `I'm interested`
  - Button 2: `Stop messages`

- **Parameter {{1}}:** Lead's first name

---

## How Button Responses Work

When a lead taps a button, WhatsApp sends a webhook with type `interactive` and `button_reply.title` matching the button text exactly.

| Button Tapped | Auto-Action |
|---|---|
| "Yes, tell me more" | Status → HOT, alert agent, pause drip |
| "Yes, let's talk" | Status → HOT, alert agent, pause drip |
| "I'm interested" | Status → HOT, alert agent, pause drip |
| "Not right now" | Status → DELAYED, pause drip, follow-up in 30 days |
| "Maybe later" | Status → DELAYED, pause drip, follow-up in 30 days |
| "Not interested" | Status → LOST, stop drip permanently, mark opted out |
| "Stop messages" | Status → LOST, stop drip permanently, mark opted out |

---

## Approval Tips

- Category must be **Marketing** (not Utility) since these are proactive follow-ups
- Meta usually approves within 24-48 hours
- If rejected, try softening language (remove "slots filling up" type urgency)
- Keep buttons under 20 characters each (all above are within limit)
