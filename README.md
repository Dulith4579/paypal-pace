# PayPal Pace – AI Affordability Agent for PayPal Checkout

> Built for **Build What's Next with PayPal and AI** (2026)

![PayPal Sandbox](https://img.shields.io/badge/PayPal-Sandbox-0070BA?style=for-the-badge&logo=paypal&logoColor=white)
![Gemma 2](https://img.shields.io/badge/AI-Gemma_2_via_Ollama-4285F4?style=for-the-badge)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=nextdotjs)
![AG Grid](https://img.shields.io/badge/AG_Grid_+_AG_Charts-FF6900?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

**Demo video:** _add YouTube link_ · **Repo:** https://github.com/Dulith4579/paypal-pace

---

## What it does

A $1,099 laptop at checkout raises one question that normal checkouts never answer: *what does this do to the goal I'm already saving for?* People either abandon the cart or buy it and feel guilty later.

**PayPal Pace** sits inside a merchant's PayPal checkout and answers that question **before** you pay:

1. A **deterministic solver** simulates every PayPal payment plan (Pay in full, Pay in 4, Pay Monthly) combined with every subscription you could pause, against your real savings goal and deadline.
2. **Gemma 2, running locally through Ollama**, picks a recommendation for your priority (Career Growth, Balanced or Goal Shield) and explains it in plain, non-judgmental language.
3. A **numeric firewall** checks every number the model wrote against the solver's output. Hallucinated figures are corrected before you see them, and advice to pause a protected subscription is blocked.
4. You pay with a **real PayPal sandbox order**. The server creates and captures it through the Orders v2 API, and the PayPal JS SDK handles the Smart Buttons and Pay Later.
5. After checkout, the **dashboard** keeps working: it guards your next installment, logs every agent action, and checks impulse purchases against your goal.

The AI never invents money math. Numbers come from code, the model adds judgment and language, and the firewall sits between the two.

---

## Try it in 2 minutes

| Page | URL | What to look at |
|---|---|---|
| **Baseline store (without Pace)** | `/store-standard` | Ordinary pay-the-full-amount checkout, for comparison |
| **Store with PayPal Pace** | `/store` | Open the flagship laptop, launch Pace, compare plans, pay with PayPal sandbox |
| **Overview** | `/` | Installment Guard, Agent Timeline, goal trajectory: what happened after checkout |
| **Goals & Savings** | `/#goals` | Milestone Arbitrage grid (hibernate subscriptions), impulse simulator, milestone cards, AG Studio data grids |
| **Agent Lab** | `/#checkout` | Run the Pace checkout agent on **any product and price**, without the store |

Suggested walkthrough:

1. Open `/store-standard`, add the **Apex Air 13" Laptop** to the cart and note the full-amount checkout.
2. Open `/store`, select the same laptop and open **PayPal Pace**.
3. Switch the priority mode between **Career Growth / Balanced / Goal Shield** and watch the recommendation change.
4. Open the reasoning panel and click **Inject Hallucination**. The firewall flags the fake number (or the protected-subscription advice) and shows the verified correction.
5. Choose a plan and pay. Use the **PayPal / Pay Later** button with a sandbox buyer account, or the instant sandbox card capture. You'll see a real **Order ID and Capture ID**.
6. Open **Overview** (`/`) to see the purchase reflected in the Installment Guard, Agent Timeline and goal chart.
7. Open **Goals & Savings** to hibernate a subscription or test an impulse buy, and watch the goal date move.
8. Open **Agent Lab** and type your own product and price, for example a $2,400 course, to run the same agent on it.

> All store products and brands (Apex Electronics, Apex Air, ApexView, Glide, QuietWave) are fictional. Product art is original SVG.

---

## Features

### Checkout agent: Solve → Propose → Verify (`POST /api/agent`)
- **Solve:** `strategy-solver.ts` ranks every plan × subscription-pause combination by goal delay, cash-flow feasibility and the selected priority mode.
- **Propose:** Gemma 2 receives the top 3 verified options and returns one **schema-constrained JSON** response with a pick plus a title and rationale for each card.
- **Verify:** `firewallCheck()` extracts every number from the model's text and matches it against solver facts (±2%). It also checks for contradictions with the plan and for pauses of protected subscriptions. Failing cards are auto-corrected, and Gemma's pick is accepted only if it stays within guardrails of the solver's optimum.
- **Glass box:** the reasoning panel shows score bars, the scoring formula, and the firewall verdict for each card.

### Firewall injection demo (`POST /api/agent/firewall`)
Plants a deliberate hallucination (a fake goal delay, or "pause Cloud Tier") into a card and runs it through the **same** validator that guards real model output. It makes no model call, so it answers instantly.

### Milestone Arbitrage & Impulse Shock-Absorber (`POST /api/agent/arbitrage`)
- **AI Value Audit:** an AG Grid of subscriptions with usage notes from Gemma. You can hibernate a subscription and watch the goal date move. Each row also shows when it's safe to resume.
- **Impulse simulator:** test a purchase ("ANC Headphones $350") and get a verdict computed by the engine, plus a coach note from Gemma, also behind the numeric firewall.

### Agent Lab
Opens the same checkout agent the store uses (`PayPalPaceModal`: solver, Gemma, firewall, and a real PayPal sandbox capture) for any product name and price. It also includes the quick checkout simulator and an AG Grid expense rebalancer with a readable "How Pace decided" breakdown. The raw engine JSON is available in a collapsible section.

### Next-Installment Guard
After a Pay in 4 or Pay Monthly checkout, the dashboard forecasts whether your surplus will cover the next installment by its due date. If it won't, it proposes the smallest set of subscription hibernations that closes the gap.

### Agent Activity Timeline and Goal Trajectory
Every agent action (analysis, firewall blocks, PayPal captures) is logged in a timeline. An AG Charts trajectory compares the goal path with and without the purchase.

### Resilient by design
- If Ollama isn't running, every endpoint **falls back to the deterministic engine**, so the app stays fully usable.
- Gemma results are cached for 10 minutes and duplicate requests are de-duplicated. `GET /api/agent` warms the model.
- AI inference runs **on-device**: the only model call goes to `127.0.0.1`.

---

## Tools used

### AI
| Tool | How it's used |
|---|---|
| **Gemma 2 (2B) via [Ollama](https://ollama.com)**, local | The main AI. Picks the recommended plan, writes persona-specific titles and rationales (`/api/agent`), and writes subscription value-audit notes and impulse coach notes (`/api/agent/arbitrage`). Called with Ollama's JSON-schema `format` for structured output. |
| **Numeric firewall** (`src/lib/strategy-solver.ts`) | Our own guardrail layer. Validates every number and claim the model produces against deterministic solver facts. |
| OpenAI `gpt-4o-mini` *(optional, legacy)* | Used only by the older `/api/agent/rebalance` endpoint when `OPENAI_API_KEY` is set. It isn't needed for the demo flows. |

### PayPal
| Capability | Where |
|---|---|
| **OAuth 2.0 client-credentials** with token caching | `src/lib/paypal-client.ts`, `/api/paypal/auth` |
| **Orders v2 API**: create, capture, get details (live sandbox) | `/api/paypal/orders` |
| **PayPal JS SDK**: Smart Buttons (PayPal, Pay Later, Card), funding eligibility | `src/lib/paypal-sdk.ts`, `PayPalSmartButtons.tsx` |
| **Pay Later messaging** | `PayLaterMessage.tsx` on the product page and in the cart |
| **Webhooks**: signature verification, `PAYMENT.CAPTURE.COMPLETED`, `CHECKOUT.ORDER.APPROVED` | `/api/webhooks/paypal` |
| Subscriptions & Transaction Search clients | `paypal-client.ts` has cancel/get-subscription and transaction-search helpers. The demo `/api/paypal/subscriptions` and `/api/paypal/transactions` routes serve seeded data so the story is reproducible. |
| PayPal MCP server (`@paypal/mcp`) | Configured as a development tool for exploring sandbox APIs |

### Sponsor & other tools
- **AG Grid** (subscription audit and expense grids) and **AG Charts** (goal trajectory)
- **Postman**: `postman_collection.json` covers every API route
- Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Zod (request validation)

---

## Architecture

```text
 Browser ─ /store-standard · /store (PayPal Smart Buttons + Pace modal) · / dashboard
    │
    ▼
 Next.js route handlers
    ├─ /api/agent            Solve → Propose (Gemma) → Verify (firewall)
    ├─ /api/agent/firewall   Hallucination injection demo (no model call)
    ├─ /api/agent/arbitrage  Value audit + impulse verdicts
    ├─ /api/paypal/orders    Orders v2 create / capture
    ├─ /api/paypal/auth      OAuth2 token
    └─ /api/webhooks/paypal  Webhook receiver
    │
    ├─ strategy-solver.ts / arbitrage.ts / installment-guard.ts   (deterministic math)
    │
    ├──► Ollama · Gemma 2 2B   (127.0.0.1:11434, on-device)
    └──► PayPal Sandbox        (api-m.sandbox.paypal.com)
```

Shared app state (purchases, paused subscriptions, goal contributions) lives in `src/lib/pace-store.ts`. It's persisted to `localStorage` and synced across tabs.

---

## Setup & run

### Prerequisites
- **Node.js 20.9+** (tested on Node 24)
- **Ollama**: https://ollama.com/download *(optional, since the app falls back to the deterministic engine without it)*
- A **PayPal Developer** sandbox app: https://developer.paypal.com/dashboard/applications/sandbox

### 1. Install
```bash
git clone https://github.com/Dulith4579/paypal-pace.git
cd paypal-pace
npm install
```

### 2. Start the local model
```bash
ollama pull gemma2:2b
ollama serve            # skip if the Ollama app is already running
```

### 3. Configure environment
```bash
cp .env.example .env.local
```

| Variable | Required | Description |
|---|---|---|
| `PAYPAL_CLIENT_ID` | ✅ | Sandbox app client ID (server-side OAuth) |
| `PAYPAL_CLIENT_SECRET` | ✅ | Sandbox app secret |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | ✅ | Same client ID, used by the PayPal JS SDK buttons |
| `OLLAMA_URL` | – | Default `http://127.0.0.1:11434` |
| `OLLAMA_MODEL` | – | Default `gemma2:2b` |
| `PAYPAL_WEBHOOK_ID` | – | Enables webhook signature verification |
| `OPENAI_API_KEY` | – | Only for the legacy `/api/agent/rebalance` endpoint |
| `NEXT_PUBLIC_BASE_URL` | – | Default `http://localhost:3000` |

### 4. Run
```bash
npm run dev
```
Open http://localhost:3000/store-standard, http://localhost:3000/store and http://localhost:3000.

**Notes**
- On CPU, the first Gemma call takes about 30 s while the model loads. Visit `/store` once (it pre-warms the agent), or call `GET /api/agent`, before demoing.
- For Pay Later and PayPal buttons, log in with a **sandbox personal account** from the PayPal Developer dashboard. The instant card capture uses PayPal's documented sandbox test card.
- To reset the demo, clear the site's `localStorage` (DevTools → Application → Local Storage).

---

## The math

All money math is deterministic and runs **before** the model:

| Quantity | Formula |
|---|---|
| Remaining to goal | `R = Target − Saved` |
| Days remaining | `D = TargetDate − Today` |
| Required daily rate | `r = R / D` |
| Goal delay from purchase `P` | `ΔD = P × D / R` |
| Daily catch-up hike | `Δr = P / D` |
| Plan cash-flow | Payment schedules from `planPayments()`: Pay in 4 = 4 × 25% every 2 weeks; Pay Monthly = 6 or 12 payments |

---

## Project structure

```
src/
├── app/
│   ├── page.tsx                 # App tabs: Overview · Goals & Savings · Agent Lab
│   ├── store/page.tsx           # Store with PayPal Pace
│   ├── store-standard/page.tsx  # Baseline store without Pace
│   └── api/
│       ├── agent/route.ts             # Solve → Propose → Verify
│       ├── agent/firewall/route.ts    # Hallucination injection demo
│       ├── agent/arbitrage/route.ts   # Value audit + impulse simulator
│       ├── agent/rebalance/route.ts   # Legacy empathy endpoint
│       ├── paypal/{auth,orders,subscriptions,transactions}/route.ts
│       └── webhooks/paypal/route.ts
├── components/
│   ├── PayPalPaceModal.tsx      # Checkout agent UI
│   ├── AgentLab.tsx             # Run the agent on any product/price
│   ├── PacingSummaryCard.tsx    # "How Pace decided" breakdown
│   ├── ReasoningPanel.tsx       # Glass-box scores + firewall injection
│   ├── PayPalSmartButtons.tsx   # PayPal JS SDK buttons
│   ├── PayLaterMessage.tsx
│   ├── InstallmentGuard.tsx
│   ├── AgentTimeline.tsx
│   ├── GoalTrajectoryChart.tsx  # AG Charts
│   ├── MilestoneArbitrageCard.tsx / ExpenseRebalanceGrid.tsx  # AG Grid
│   └── storefront/Storefront.tsx
└── lib/
    ├── strategy-solver.ts       # Solver + numeric firewall
    ├── arbitrage.ts · installment-guard.ts · pacing.ts · math-engine.ts
    ├── paypal-client.ts         # Server-side PayPal REST client
    ├── paypal-sdk.ts            # Browser JS SDK loader
    ├── pace-store.ts            # Shared state (localStorage)
    └── mock-data.ts             # Demo user, goals, subscriptions
```

---

## License

[MIT](LICENSE) © 2026 Dulith. Built for the *Build What's Next with PayPal and AI* hackathon.
