"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  BarChart3,
  Table2,
  TrendingUp,
  PieChart,
  MessageSquare,
  ChevronDown,
  Send,
  Sparkles,
  Search,
  Download,
} from "lucide-react";
import type { StudioSource } from "@/lib/studio-config";
import { AgGridReact } from "ag-grid-react";
import { ModuleRegistry, AllCommunityModule, type ICellRendererParams } from "ag-grid-community";

// Register here too, so this grid never depends on another component loading first (error #200)
ModuleRegistry.registerModules([AllCommunityModule]);

/** "progressRenderer" referenced by milestoneGridColDefs (studio-config). */
function ProgressCell(p: ICellRendererParams) {
  const v = Math.max(0, Math.min(100, Number(p.value) || 0));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, height: "100%" }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.12)" }}>
        <div style={{ width: `${v}%`, height: 6, borderRadius: 3, background: v >= 100 ? "#34D399" : "#0070BA" }} />
      </div>
      <span style={{ fontSize: 12, minWidth: 38, textAlign: "right" }}>{v.toFixed(0)}%</span>
    </div>
  );
}
const GRID_COMPONENTS = { progressRenderer: ProgressCell };
import { milestoneGridColDefs, transactionGridColDefs, subscriptionGridColDefs } from "@/lib/studio-config";

import {
  getMilestonesSource,
  getTransactionsSource,
  getSubscriptionsSource,
  aiPromptStarters,
  studioTheme,
} from "@/lib/studio-config";
import { formatCurrency } from "@/lib/math-engine";

type TabId = "milestones" | "transactions" | "subscriptions" | "ai-chat";

interface Tab {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const tabs: Tab[] = [
  { id: "milestones", label: "Milestones", icon: TrendingUp },
  { id: "transactions", label: "Transactions", icon: Table2 },
  { id: "subscriptions", label: "Subscriptions", icon: PieChart },
  { id: "ai-chat", label: "AI Assistant", icon: MessageSquare },
];

const emptySource: StudioSource = { name: "", columns: [], data: [] };

export default function StudioDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>("milestones");
  const [sortField, setSortField] = useState<string>("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [aiInput, setAiInput] = useState("");
  const [aiMessages, setAiMessages] = useState<
    Array<{ role: "user" | "assistant"; content: string }>
  >([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  // AG Grid quick filter (searches every column) + CSV export
  const gridRef = useRef<AgGridReact>(null);
  const [quickFilter, setQuickFilter] = useState("");
  const [shownRows, setShownRows] = useState<number | null>(null);

  const [milestonesData, setMilestonesData] = useState<StudioSource>(emptySource);
  const [transactionsData, setTransactionsData] = useState<StudioSource>(emptySource);
  const [subscriptionsData, setSubscriptionsData] = useState<StudioSource>(emptySource);

  useEffect(() => {
    setMilestonesData(getMilestonesSource());
    setTransactionsData(getTransactionsSource());
    setSubscriptionsData(getSubscriptionsSource());
  }, []);

  const currentSource = useMemo(() => {
    switch (activeTab) {
      case "milestones":
        return milestonesData;
      case "transactions":
        return transactionsData;
      case "subscriptions":
        return subscriptionsData;
      default:
        return milestonesData;
    }
  }, [activeTab, milestonesData, transactionsData, subscriptionsData]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortField) return currentSource.data;
    return [...currentSource.data].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal || "");
      const bStr = String(bVal || "");
      return sortDir === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
  }, [currentSource.data, sortField, sortDir]);

  const exportCsv = useCallback(() => {
    gridRef.current?.api?.exportDataAsCsv({
      fileName: `paypal-pace-${activeTab}-${new Date().toISOString().split("T")[0]}.csv`,
      // Respects the current search + column filters + sort: "export what you see"
      exportedRows: "filteredAndSorted",
    });
  }, [activeTab]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const handleAiChat = async () => {
    if (!aiInput.trim()) return;
    const userMessage = aiInput.trim();
    setAiInput("");
    setAiMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsAiLoading(true);

    // Simulate AI response
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const responses: Record<string, string> = {
      default: `Based on your current data, here's what I found:\n\n📊 **Milestones Overview:**\n- You have ${milestonesData.data.length} active goals\n- Total saved: ${formatCurrency(milestonesData.data.reduce((s, m) => s + (m.current_balance as number), 0))}\n- Strongest goal: "${(milestonesData.data.reduce((p, c) => ((c.progress_pct as number) > (p.progress_pct as number) ? c : p)).name as string)}"\n\n💡 **Recommendation:** Focus on your closest deadline first, then build momentum.`,
      subscription: `📋 **Subscription Analysis:**\n\n🔴 **Dormant (not used in 30+ days):**\n${subscriptionsData.data.filter((s) => s.status === "dormant").map((s) => `- ${s.service_name}: ${formatCurrency(s.monthly_cost as number)}/mo`).join("\n")}\n\n💰 Cancelling all dormant subscriptions saves **${formatCurrency(subscriptionsData.data.filter((s) => s.status === "dormant").reduce((sum, s) => sum + (s.monthly_cost as number), 0))}/month**!`,
      delayed: `⏱️ **Goal Delay Analysis:**\n\nBased on recent spending patterns:\n${milestonesData.data.map((m) => `- ${m.name}: ${(m.progress_pct as number).toFixed(1)}% complete, need ${formatCurrency(m.daily_burn_rate as number)}/day`).join("\n")}\n\nGoals under 50% progress may need attention. Consider activating Micro-Surge mode.`,
      trajectory: `📈 **Savings Trajectory Projection:**\n\nIf you cut $20/week from takeout:\n- Extra monthly savings: $80\n- Annual impact: $960\n${milestonesData.data.slice(0, 3).map((m) => `- "${m.name}" reaches target ~${Math.ceil(((m.target_amount as number) - (m.current_balance as number)) / (((m.daily_burn_rate as number) || 1) + 80 / 30))} days sooner`).join("\n")}\n\n🎯 That's like getting a free month of progress!`,
    };

    const lowerMsg = userMessage.toLowerCase();
    let response = responses.default;
    if (lowerMsg.includes("subscription") || lowerMsg.includes("unused")) {
      response = responses.subscription;
    } else if (lowerMsg.includes("delay") || lowerMsg.includes("which")) {
      response = responses.delayed;
    } else if (lowerMsg.includes("trajectory") || lowerMsg.includes("cut") || lowerMsg.includes("plot")) {
      response = responses.trajectory;
    }

    setAiMessages((prev) => [...prev, { role: "assistant", content: response }]);
    setIsAiLoading(false);
  };

  return (
    <div className="card-elevated overflow-hidden animate-fade-in">
      {/* Header */}
      <div
        className="p-4 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--border-default)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(0, 112, 186, 0.1)" }}
          >
            <BarChart3 className="w-5 h-5" style={{ color: "var(--accent-text)" }} />
          </div>
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              AG Studio Analytics
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{
                  background: "var(--paypal-gold)",
                  color: "var(--text-primary)",
                }}
              >
                POWERED BY AG GRID
              </span>
            </h2>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Interactive data exploration &amp; AI-powered insights
            </p>
          </div>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          id="studio-export-csv-header"
          onClick={exportCsv}
          disabled={activeTab === "ai-chat"}
          title="Export the current table as CSV (AG Grid)"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Tab Bar */}
      <div
        className="flex items-center gap-1 px-4 pt-3 pb-0 overflow-x-auto"
        style={{ borderBottom: "1px solid var(--border-default)" }}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`studio-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all relative whitespace-nowrap"
              style={{
                color: isActive ? "var(--paypal-blue)" : "var(--text-secondary)",
                borderBottom: isActive ? "2px solid var(--paypal-blue)" : "2px solid transparent",
                marginBottom: "-1px",
              }}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.id === "subscriptions" && (
                <span
                  className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                  style={{
                    background: "var(--danger-bg)",
                    color: "var(--danger-text)",
                  }}
                >
                  {subscriptionsData.data.filter((s) => s.status === "dormant").length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="p-4">
        {activeTab === "ai-chat" ? (
          /* AI Chat Interface */
          <div className="flex flex-col" style={{ minHeight: "400px" }}>
            {/* Prompt Starters */}
            {aiMessages.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center py-8">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 animate-float"
                  style={{ background: "linear-gradient(135deg, var(--paypal-blue) 0%, var(--paypal-navy) 100%)" }}
                >
                  <Sparkles className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-lg font-bold mb-1" style={{ color: "var(--brand-text)" }}>
                  AI Financial Assistant
                </h3>
                <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
                  Ask me anything about your financial data
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                  {aiPromptStarters.slice(0, 4).map((prompt, i) => (
                    <button
                      key={i}
                      className="text-left text-xs p-3 rounded-lg transition-all hover:scale-[1.02]"
                      style={{
                        background: "var(--bg-primary)",
                        border: "1px solid var(--border-default)",
                        color: "var(--text-secondary)",
                      }}
                      onClick={() => {
                        setAiInput(prompt);
                      }}
                    >
                      <Sparkles className="w-3 h-3 inline mr-1.5" style={{ color: "var(--accent-text)" }} />
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Chat Messages */}
            {aiMessages.length > 0 && (
              <div className="flex-1 space-y-4 mb-4 max-h-[400px] overflow-y-auto">
                {aiMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}
                  >
                    <div
                      className="max-w-[80%] rounded-xl px-4 py-3 text-sm whitespace-pre-line"
                      style={{
                        background:
                          msg.role === "user"
                            ? "linear-gradient(135deg, var(--paypal-blue) 0%, var(--paypal-navy) 100%)"
                            : "var(--bg-primary)",
                        color: msg.role === "user" ? "#ffffff" : "var(--text-primary)",
                        border: msg.role === "assistant" ? "1px solid var(--border-default)" : "none",
                      }}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {isAiLoading && (
                  <div className="flex justify-start">
                    <div
                      className="rounded-xl px-4 py-3 text-sm"
                      style={{
                        background: "var(--bg-primary)",
                        border: "1px solid var(--border-default)",
                      }}
                    >
                      <span className="flex items-center gap-2" style={{ color: "var(--text-muted)" }}>
                        <Sparkles className="w-4 h-4 animate-spin" style={{ color: "var(--accent-text)" }} />
                        Analyzing your data...
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Input */}
            <div
              className="flex items-center gap-2 p-2 rounded-xl"
              style={{
                background: "var(--bg-primary)",
                border: "1px solid var(--border-default)",
              }}
            >
              <input
                id="ai-chat-input"
                type="text"
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAiChat()}
                placeholder="Ask about your finances..."
                className="flex-1 bg-transparent px-3 py-2 text-sm outline-none"
                style={{ color: "var(--text-primary)" }}
              />
              <button
                id="ai-chat-send"
                className="btn btn-primary btn-sm"
                onClick={handleAiChat}
                disabled={!aiInput.trim() || isAiLoading}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Data Grid using AG Grid */}
            {/* Quick filter: one search box across every column (AG Grid quickFilterText) */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg flex-1 min-w-0"
                style={{ background: "var(--bg-primary)", border: "1px solid var(--border-default)", maxWidth: 360 }}
              >
                <Search className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
                <input
                  id="studio-quick-filter"
                  type="search"
                  value={quickFilter}
                  onChange={(e) => setQuickFilter(e.target.value)}
                  placeholder={
                    activeTab === "transactions" ? "Search merchant, note, amount…" : activeTab === "subscriptions" ? "Search service, status…" : "Search goals…"
                  }
                  className="flex-1 bg-transparent text-sm outline-none min-w-0"
                  style={{ color: "var(--text-primary)" }}
                />
              </div>
            </div>
            <div className="ag-theme-quartz-dark pace-grid h-[500px]" style={{ width: "100%" }}>
              <AgGridReact
                // Fresh grid per tab: never apply one tab's columns to another tab's rows
                key={activeTab}
                ref={gridRef}
                theme="legacy"
                components={GRID_COMPONENTS}
                quickFilterText={quickFilter}
                onModelUpdated={(e) => setShownRows(e.api.getDisplayedRowCount())}
                rowData={sortedData}
                columnDefs={
                  activeTab === "milestones"
                    ? milestoneGridColDefs
                    : activeTab === "transactions"
                    ? transactionGridColDefs
                    : activeTab === "subscriptions"
                    ? subscriptionGridColDefs
                    : []
                }
                defaultColDef={{ sortable: true, filter: true, resizable: true }}
                animateRows={true}
              />
            </div>

            {/* Grid Footer */}
            <div
              className="flex items-center justify-between pt-3 mt-3"
              style={{ borderTop: "1px solid var(--border-default)" }}
            >
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                Showing {shownRows ?? sortedData.length} of {currentSource.data.length} records
                {quickFilter && ` matching “${quickFilter}”`} · click a header to sort, ☰ to filter a column
              </span>
              <div className="flex items-center gap-2">
                <button className="btn btn-ghost btn-sm" id="studio-export-csv" onClick={exportCsv}>
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
