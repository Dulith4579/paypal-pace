# 🚀 PayPal Pace – AI Financial Co-Pilot

> **Hackathon:** Build What's Next with PayPal and AI
> **Tracks:** Best Overall ($12K) · Best Agentic Commerce ($5K) · Best Demo Delivery ($5K) · AG Grid Sponsor ($10K)

![PayPal Pace](https://img.shields.io/badge/PayPal-Pace-0070BA?style=for-the-badge&logo=paypal&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-14+-000000?style=for-the-badge&logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?style=for-the-badge&logo=typescript)
![AG Grid](https://img.shields.io/badge/AG_Grid-Studio-FF6900?style=for-the-badge)

---

## 💡 What is PayPal Pace?

Traditional personal finance apps **judge users** and trigger "budget burnout." PayPal Pace flips the script — it turns large purchases into **structured, guilt-free recovery plans**.

When you buy something, Pace doesn't scold. It says _"Life happens! Enjoy your purchase. Here's how we adapt."_ and presents **4 concrete recovery paths**:

| Path | Description |
|------|-------------|
| **🕐 Timeline Flex** | Push target dates out automatically |
| **📈 Micro-Surge Catch-Up** | Temporarily increment daily auto-saves |
| **💳 PayPal Pay in 4** | Split into 4 interest-free installments |
| **✂️ Subscription Clean-up** | Cancel dormant subscriptions to fund the deficit |

---

## 🏗️ Architecture

```text
┌─────────────────────────────────────────────────┐
│                 Next.js App Router               │
├──────────┬──────────┬───────────┬───────────────┤
│ Dashboard│ Checkout │Reassurance│  AG Studio    │
│   Hero   │Simulator │  Modal    │  Analytics    │
├──────────┴──────────┴───────────┴───────────────┤
│              API Route Handlers                  │
│  /paypal/auth · /orders · /subscriptions        │
│  /agent/rebalance · /webhooks/paypal            │
├─────────────────────────────────────────────────┤
│  Math Engine │ PayPal Client │ Studio Config    │
│  (deterministic) │ (OAuth2 cache) │ (AG Grid)  │
├─────────────────────────────────────────────────┤
│      PayPal Sandbox API     │   OpenAI API      │
└─────────────────────────────┴───────────────────┘
```

---

## ⚡ Quick Start

### 1. Clone & Install

```bash
cd paypal-pace
npm install
```

### 2. Configure Environment

```bash
cp .env.local.example .env.local
# Edit .env.local with your credentials
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔧 Environment Variables

| Variable | Description |
|----------|-------------|
| `PAYPAL_CLIENT_ID` | PayPal sandbox app client ID |
| `PAYPAL_CLIENT_SECRET` | PayPal sandbox app secret |
| `PAYPAL_WEBHOOK_ID` | PayPal sandbox webhook ID |
| `OPENAI_API_KEY` | OpenAI API key for AI responses |
| `NEXT_PUBLIC_BASE_URL` | Application base URL |

---

## 📁 Project Structure

```
paypal-pace/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Root layout with Inter font
│   │   ├── page.tsx                # Main dashboard
│   │   ├── globals.css             # Design system & tokens
│   │   └── api/
│   │       ├── paypal/
│   │       │   ├── auth/route.ts   # OAuth2 token manager
│   │       │   ├── orders/route.ts # Order create & capture
│   │       │   ├── transactions/route.ts
│   │       │   └── subscriptions/route.ts
│   │       ├── agent/
│   │       │   └── rebalance/route.ts  # AI rebalancing
│   │       └── webhooks/
│   │           └── paypal/route.ts     # Webhook receiver
│   ├── components/
│   │   ├── Navbar.tsx              # PayPal-branded nav
│   │   ├── MilestoneCard.tsx       # Goal progress cards
│   │   ├── CheckoutSimulator.tsx   # Purchase simulator
│   │   ├── ReassuranceModal.tsx    # Empathetic AI modal
│   │   └── StudioDashboard.tsx     # AG Studio analytics
│   ├── lib/
│   │   ├── math-engine.ts         # Deterministic formulas
│   │   ├── paypal-client.ts       # PayPal API client
│   │   ├── studio-config.ts       # AG Studio config
│   │   └── mock-data.ts           # Seed data
│   └── types/
│       ├── financial.ts           # Financial domain types
│       └── paypal.ts              # PayPal API types
```

---

## 🧮 Math Engine

All calculations are deterministic and run **before** the LLM:

- **Remaining Balance:** `R = T - B`
- **Days Remaining:** `D = Target Date - Today`
- **Base Daily Rate:** `r = R / D`
- **Delay (days):** `ΔD = P × D / R`
- **Daily Hike:** `Δr = P / D`
- **Pay in 4 Drag:** `P / 56 per day` (spread across 8 weeks)

---

## 🔗 PayPal Integration

- **OAuth2** with in-memory token caching (refresh at 30-min before expiry)
- **Orders API** – Create and capture sandbox orders
- **Subscriptions API** – List and cancel recurring billing
- **Webhooks** – Handle `PAYMENT.CAPTURE.COMPLETED` events
- **Transaction Search** – Mock + live transaction fetching

---

## 🤖 AI Agent

The rebalancing agent uses GPT-4o-mini with an empathetic system prompt that:
1. **Never scolds** the user
2. **Validates** the purchase immediately
3. **Presents** the neutral mathematical impact
4. **Offers** 4 concrete recovery options

Falls back to locally-generated responses if no API key is configured.

---

## 📊 AG Studio Integration

- **3 data sources:** Milestones, Transactions, Subscriptions
- **Relationships:** Transactions → Milestones (many-to-one)
- **Calculated expressions:** Progress %, Daily burn rate
- **AI Chat Harness:** Conversational data exploration
- **PayPal-branded theme:** Classic Blue accent, Deep Navy secondary

---

## 📜 License

MIT – Built for the PayPal AI Hackathon 2024.
