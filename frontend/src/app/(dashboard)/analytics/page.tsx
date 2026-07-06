"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { Header } from "@/components/dashboard/Header";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { DailyUsage, ModelUsage } from "@/types";

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

  const daily: DailyUsage[] = dailyData?.data || dailyData || [];
  const models: ModelUsage[] = modelsData?.data || modelsData || [];

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
      </div>
    </div>
  );
}
