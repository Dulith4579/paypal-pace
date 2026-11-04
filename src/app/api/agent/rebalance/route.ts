// ============================================================
// PayPal Pace – AI Rebalancing Agent Route
// ============================================================
// POST /api/agent/rebalance
// Accepts a purchase amount, runs deterministic math first,
// then calls the LLM for empathetic recommendations.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { mockMilestones, mockSubscriptions } from "@/lib/mock-data";
import { calculateAllImpacts, formatCurrency } from "@/lib/math-engine";
import type { RebalanceResult } from "@/types/financial";

const SYSTEM_PROMPT = `You are PayPal Pace, a judgment-free, empathetic financial companion.
When analyzing an expense against user savings goals:
1. NEVER scold, criticize, or use words like "irresponsible", "failed", or "mistake".
2. Validate the spend immediately ("Treating yourself or handling surprise costs is part of life!").
3. Present the neutral reality check: calculate exact days delayed and the impact if using PayPal Pay in 4.
4. Output 3 concrete, one-click recovery options (Timeline Flex, Daily Micro-Adjust, or Unused Subscription Trade-Off).
5. Be warm, supportive, and solution-oriented. Use encouraging language.
6. Keep responses concise but caring — max 3-4 sentences for the empathy message.`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { purchase_amount, product_name } = body as {
      purchase_amount: number;
      product_name?: string;
    };

    if (!purchase_amount || purchase_amount <= 0) {
      return NextResponse.json(
        { success: false, error: "Invalid purchase amount" },
        { status: 400 }
      );
    }

    // ─── Step 1: Deterministic Math ────────────────────────
    const { impacts, recoveryPaths } = calculateAllImpacts(
      mockMilestones,
      purchase_amount
    );

    // ─── Step 2: Identify dormant subscriptions ────────────
    const dormantSubs = mockSubscriptions.filter((s) => s.status === "dormant");
    const potentialSavings = dormantSubs.reduce(
      (sum, s) => sum + s.monthly_cost,
      0
    );

    // Update subscription cleanup path with real numbers
    const subCleanupPath = recoveryPaths.find(
      (p) => p.type === "subscription_cleanup"
    );
    if (subCleanupPath) {
      subCleanupPath.description = `Cancel ${dormantSubs.length} dormant subscriptions to recover ${formatCurrency(potentialSavings)}/month.`;
      subCleanupPath.metric_value = formatCurrency(potentialSavings);
      subCleanupPath.metric_label = "Monthly savings";
    }

    // ─── Step 3: Build LLM context (or generate locally) ───
    let empathyMessage = "";
    let aiRecommendation = "";

    const mostAffected = impacts.reduce(
      (prev, curr) => (curr.delay_days > prev.delay_days ? curr : prev),
      impacts[0]
    );

    // Try OpenAI if API key is available
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey && openaiKey !== "your_llm_api_key") {
      try {
        const llmResponse = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${openaiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: [
                { role: "system", content: SYSTEM_PROMPT },
                {
                  role: "user",
                  content: `The user just purchased "${product_name || "an item"}" for ${formatCurrency(purchase_amount)}.

Here is the mathematical impact analysis:
${impacts
  .map(
    (i) =>
      `- Goal "${i.goal_name}": ${i.progress_pct.toFixed(1)}% complete, delays target by ${i.delay_days} days. Daily savings would need to increase by ${formatCurrency(i.daily_hike)}/day to stay on track. Pay in 4 would cost ${formatCurrency(i.pay_in_4_installment)} every 2 weeks.`
  )
  .join("\n")}

Dormant subscriptions that could be cancelled: ${dormantSubs.map((s) => `${s.service_name} ($${s.monthly_cost}/mo)`).join(", ")} — total potential savings of ${formatCurrency(potentialSavings)}/month.

Please provide:
1. A warm, empathetic message (2-3 sentences, no judgment)
2. Your top recommendation among the recovery paths`,
                },
              ],
              temperature: 0.7,
              max_tokens: 300,
            }),
          }
        );

        if (llmResponse.ok) {
          const llmData = await llmResponse.json();
          const content = llmData.choices?.[0]?.message?.content || "";

          // Split response into empathy + recommendation
          const parts = content.split("\n\n");
          empathyMessage = parts[0] || content;
          aiRecommendation =
            parts.slice(1).join("\n\n") ||
            "I recommend the Micro-Surge Catch-Up to keep your goals on track with minimal daily effort!";
        }
      } catch (llmError) {
        console.error("[AI Rebalance] LLM call failed, using fallback:", llmError);
      }
    }

    // Fallback empathy message if LLM is unavailable
    if (!empathyMessage) {
      empathyMessage = `Life happens, and treating yourself is important! 🎉 Your ${product_name || "purchase"} of ${formatCurrency(purchase_amount)} is a valid choice. Let's look at how we can keep your savings goals on track — here are some easy options that won't stress you out.`;
    }

    if (!aiRecommendation) {
      if (mostAffected) {
        aiRecommendation = `I'd suggest the Micro-Surge Catch-Up — just an extra ${formatCurrency(mostAffected.daily_hike)}/day keeps your "${mostAffected.goal_name}" goal right on schedule. That's less than a coffee! ☕`;
      } else {
        aiRecommendation =
          "Your savings goals are in great shape! This purchase barely makes a dent.";
      }
    }

    // ─── Step 4: Assemble result ────────────────────────────
    const result: RebalanceResult = {
      purchase_amount,
      empathy_message: empathyMessage,
      impacts,
      recovery_paths: recoveryPaths,
      ai_recommendation: aiRecommendation,
    };

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("[AI Rebalance]", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to process rebalancing",
      },
      { status: 500 }
    );
  }
}
