"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { Coins } from "lucide-react";
import { Header } from "@/components/dashboard/Header";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UsageBarChart, formatTokens, formatUsd } from "@/components/usage/UsageBarChart";
import { api, getApi } from "@/lib/api";
import { cn } from "@/components/ui/button";
import {
  DailyUsage, ModelUsage,
  UsageSummary, UsageDaily, UsageByModel, TopConversationUsage,
} from "@/types";

const COLORS = ["#00D4FF", "#0066CC", "#00FF88", "#FFB800", "#FF3366"];

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-strong border border-jarvis-border rounded-xl px-4 py-3">
      {label && <p className="text-xs font-mono text-jarvis-text-muted mb-2">{label}</p>}
      {payload.map((entry) => (
        <p key={entry.name} className="text-xs font-mono" style={{ color: entry.color }}>
          {entry.name}: <span className="font-bold">{entry.value.toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
};

export default function AnalyticsPage() {
  const { data: dailyData, isLoading: dailyLoading } = useQuery({
    queryKey: ["analytics-daily"],
    queryFn: () => api.analytics.daily({ days: 30 }).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const { data: modelsData, isLoading: modelsLoading } = useQuery({
    queryKey: ["analytics-models"],
    queryFn: () => api.analytics.models().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  // ─── Usage & costs ───
  const { data: usageSummary } = useQuery({
    queryKey: ["usage-summary"],
    queryFn: async () => (await getApi().usage.summary()).data as UsageSummary,
    staleTime: 5 * 60 * 1000,
  });

  const { data: usageDaily = [] } = useQuery({
    queryKey: ["usage-daily"],
    queryFn: async () => {
      const response = await getApi().usage.daily({ days: 30 });
      return ((response.data as { items?: UsageDaily[] })?.items ?? []) as UsageDaily[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: usageByModel = [] } = useQuery({
    queryKey: ["usage-by-model"],
    queryFn: async () => {
      const response = await getApi().usage.byModel({ days: 30 });
      return ((response.data as { items?: UsageByModel[] })?.items ?? []) as UsageByModel[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: topConversations = [] } = useQuery({
    queryKey: ["usage-top-conversations"],
    queryFn: async () => {
      const response = await getApi().usage.topConversations({ days: 30 });
      return ((response.data as { items?: TopConversationUsage[] })?.items ?? []) as TopConversationUsage[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const daily: DailyUsage[] = dailyData?.data || dailyData || [];
  const models: ModelUsage[] = modelsData?.data || modelsData || [];

  const modelsByCost = [...usageByModel].sort((a, b) => b.cost_usd - a.cost_usd);
  const topModel = modelsByCost[0];
  const maxModelCost = topModel?.cost_usd ?? 0;
  const quotaPct = usageSummary?.quota_used_pct ?? 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Analytics" subtitle="Usage metrics and insights" />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Stats cards */}
        <StatsCards />

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Daily messages chart */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Daily Messages & Tokens (30 days)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={daily} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                      <defs>
                        <linearGradient id="colorMessages" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#00D4FF" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#00D4FF" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#FFB800" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#FFB800" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#0D2137" />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: "#5A8A9F", fontSize: 10, fontFamily: "monospace" }}
                        tickFormatter={(v) => new Date(v).toLocaleDateString("en", { month: "short", day: "numeric" })}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tick={{ fill: "#5A8A9F", fontSize: 10, fontFamily: "monospace" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="messages"
                        stroke="#00D4FF"
                        strokeWidth={2}
                        fill="url(#colorMessages)"
                        name="Messages"
                      />
                      <Area
                        type="monotone"
                        dataKey="tokens"
                        stroke="#FFB800"
                        strokeWidth={2}
                        fill="url(#colorTokens)"
                        name="Tokens (K)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Model usage pie */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle>Model Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-56">
                  {models.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={models}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          dataKey="percentage"
                          nameKey="model"
                          paddingAngle={2}
                        >
                          {models.map((_, index) => (
                            <Cell
                              key={index}
                              fill={COLORS[index % COLORS.length]}
                              stroke="transparent"
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0].payload as ModelUsage;
                            return (
                              <div className="glass-strong border border-jarvis-border rounded-xl px-3 py-2">
                                <p className="text-xs font-mono text-jarvis-text">{d.model}</p>
                                <p className="text-xs font-mono text-primary">{d.percentage.toFixed(1)}%</p>
                              </div>
                            );
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <p className="text-jarvis-text-muted text-sm font-mono">No data yet</p>
                    </div>
                  )}
                </div>
                {/* Legend */}
                <div className="space-y-2 mt-2">
                  {models.slice(0, 4).map((m, i) => (
                    <div key={m.model} className="flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-jarvis-text-muted truncate max-w-28">
                          {m.model.split("-").slice(-2).join("-")}
                        </span>
                      </div>
                      <span className="text-primary">{m.percentage.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Conversations bar chart */}
        <Card>
          <CardHeader>
            <CardTitle>Daily Conversations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daily.slice(-14)} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#0D2137" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#5A8A9F", fontSize: 10, fontFamily: "monospace" }}
                    tickFormatter={(v) => new Date(v).toLocaleDateString("en", { month: "short", day: "numeric" })}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#5A8A9F", fontSize: 10, fontFamily: "monospace" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar
                    dataKey="conversations"
                    fill="#00D4FF"
                    fillOpacity={0.7}
                    radius={[4, 4, 0, 0]}
                    name="Conversations"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* ─── Usage & Costs ─── */}
        <div className="flex items-center gap-2 pt-2">
          <Coins className="w-4 h-4 text-primary" />
          <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-jarvis-text-muted">
            Usage &amp; Costs
          </h2>
          <span className="text-[10px] font-mono text-jarvis-text-muted/60">LAST 30 DAYS</span>
        </div>

        {/* Usage stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-jarvis-text-muted">
                This Month Tokens
              </p>
              <p className="mt-2 text-2xl font-mono font-bold text-jarvis-text">
                {usageSummary ? formatTokens(usageSummary.total_tokens) : "—"}
              </p>
              {usageSummary && (
                <p className="mt-1 text-[11px] font-mono text-jarvis-text-muted">
                  {formatTokens(usageSummary.input_tokens)} in · {formatTokens(usageSummary.output_tokens)} out
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-jarvis-text-muted">
                This Month Cost
              </p>
              <p className="mt-2 text-2xl font-mono font-bold text-primary">
                {usageSummary ? formatUsd(usageSummary.cost_usd) : "—"}
              </p>
              <p className="mt-1 text-[11px] font-mono text-jarvis-text-muted">across all providers</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-jarvis-text-muted">Quota</p>
              {!usageSummary ? (
                <p className="mt-2 text-2xl font-mono font-bold text-jarvis-text">—</p>
              ) : usageSummary.quota === null ? (
                <p className="mt-2 text-2xl font-mono font-bold text-jarvis-text">Unlimited</p>
              ) : (
                <>
                  <p className="mt-2 text-2xl font-mono font-bold text-jarvis-text">
                    {quotaPct.toFixed(1)}%
                  </p>
                  <div className="mt-2 h-1.5 rounded-full bg-jarvis-border/60 overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        quotaPct >= 90 ? "bg-jarvis-danger" : quotaPct >= 75 ? "bg-jarvis-warning" : "bg-primary"
                      )}
                      style={{ width: `${Math.min(100, quotaPct)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] font-mono text-jarvis-text-muted">
                    {formatTokens(usageSummary.total_tokens)} / {formatTokens(usageSummary.quota)} tokens
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-jarvis-text-muted">
                Top Model
              </p>
              <p className="mt-2 text-lg font-mono font-bold text-jarvis-text truncate" title={topModel?.model}>
                {topModel?.model ?? "—"}
              </p>
              {topModel && (
                <p className="mt-1 text-[11px] font-mono text-jarvis-text-muted">
                  {formatUsd(topModel.cost_usd)} · {formatTokens(topModel.total_tokens)} tokens
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 30-day daily token/cost chart */}
        <Card>
          <CardHeader>
            <CardTitle>Daily Token Usage &amp; Cost (30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <UsageBarChart data={usageDaily} />
          </CardContent>
        </Card>

        {/* By-model table + top conversations */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Usage by Model</CardTitle>
            </CardHeader>
            <CardContent>
              {modelsByCost.length === 0 ? (
                <p className="text-jarvis-text-muted text-sm font-mono py-4 text-center">No data yet</p>
              ) : (
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="text-left text-jarvis-text-muted border-b border-jarvis-border">
                      <th className="py-2 pr-3 font-medium">Model</th>
                      <th className="py-2 pr-3 font-medium">Provider</th>
                      <th className="py-2 pr-3 font-medium text-right">Requests</th>
                      <th className="py-2 pr-3 font-medium text-right">Tokens</th>
                      <th className="py-2 font-medium text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelsByCost.map((m) => (
                      <tr key={m.model} className="border-b border-jarvis-border/40 last:border-0">
                        <td className="py-2.5 pr-3 text-jarvis-text">{m.model}</td>
                        <td className="py-2.5 pr-3 text-jarvis-text-muted">{m.provider}</td>
                        <td className="py-2.5 pr-3 text-right text-jarvis-text-muted">
                          {m.requests.toLocaleString()}
                        </td>
                        <td className="py-2.5 pr-3 text-right text-jarvis-text-muted">
                          {formatTokens(m.total_tokens)}
                        </td>
                        <td className="py-2.5 text-right">
                          {/* subtle bar behind the cost, proportional to the max */}
                          <div className="relative inline-block min-w-20">
                            <div
                              className="absolute inset-y-0 right-0 rounded bg-primary/10"
                              style={{ width: maxModelCost > 0 ? `${(m.cost_usd / maxModelCost) * 100}%` : "0%" }}
                            />
                            <span className="relative px-1 text-primary">{formatUsd(m.cost_usd)}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top Conversations by Cost</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {topConversations.length === 0 ? (
                <p className="text-jarvis-text-muted text-sm font-mono py-4 text-center">No data yet</p>
              ) : (
                topConversations.map((c) => (
                  <Link
                    key={c.conversation_id}
                    href={`/chat?conversation=${c.conversation_id}`}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg hover:bg-primary/5 transition-colors group"
                  >
                    <span className="flex-1 min-w-0 truncate text-xs font-mono text-jarvis-text group-hover:text-primary transition-colors">
                      {c.title}
                    </span>
                    <span className="shrink-0 text-xs font-mono text-jarvis-text-muted">
                      {formatTokens(c.total_tokens)} tok
                    </span>
                    <span className="shrink-0 w-14 text-right text-xs font-mono text-primary">
                      {formatUsd(c.cost_usd)}
                    </span>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
