"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import type { UsageDaily } from "@/types";

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

const shortDate = (v: string) =>
  new Date(`${v}T00:00:00`).toLocaleDateString("en", { month: "short", day: "numeric" });

function UsageTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: UsageDaily }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="glass-strong border border-jarvis-border rounded-xl px-4 py-3 space-y-1">
      <p className="text-xs font-mono text-jarvis-text-muted">{shortDate(d.date)}</p>
      <p className="text-xs font-mono" style={{ color: "#00D4FF" }}>
        Input: <span className="font-bold">{d.input_tokens.toLocaleString()}</span>
      </p>
      <p className="text-xs font-mono" style={{ color: "#0066CC" }}>
        Output: <span className="font-bold">{d.output_tokens.toLocaleString()}</span>
      </p>
      <p className="text-xs font-mono text-jarvis-text">
        Total: <span className="font-bold">{formatTokens(d.input_tokens + d.output_tokens)}</span>
      </p>
      <p className="text-xs font-mono" style={{ color: "#FFB800" }}>
        Cost: <span className="font-bold">{formatUsd(d.cost_usd)}</span>
      </p>
    </div>
  );
}

/** Stacked daily token bars (input + output) with cost surfaced on hover. */
export function UsageBarChart({ data }: { data: UsageDaily[] }) {
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#0D2137" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "#5A8A9F", fontSize: 10, fontFamily: "monospace" }}
            tickFormatter={(v) => shortDate(String(v))}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fill: "#5A8A9F", fontSize: 10, fontFamily: "monospace" }}
            tickFormatter={(v) => formatTokens(Number(v))}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<UsageTooltip />} cursor={{ fill: "rgba(0, 212, 255, 0.05)" }} />
          <Bar dataKey="input_tokens" stackId="tokens" fill="#00D4FF" fillOpacity={0.75} name="Input" />
          <Bar
            dataKey="output_tokens"
            stackId="tokens"
            fill="#0066CC"
            fillOpacity={0.85}
            radius={[4, 4, 0, 0]}
            name="Output"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
