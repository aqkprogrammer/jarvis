"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Cpu, Brain, CheckCircle2, TrendingUp, Clock } from "lucide-react";
import { cn } from "@/components/ui/button";

interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  positive?: boolean;
  icon: React.ReactNode;
  color?: string;
  loading?: boolean;
}

function StatCard({ title, value, change, positive, icon, color = "text-primary", loading }: StatCardProps) {
  return (
    <Card className="relative overflow-hidden">
      <div className="absolute top-0 right-0 w-24 h-24 opacity-5">
        <div className={cn("w-full h-full flex items-center justify-center", color)}>
          {icon}
        </div>
      </div>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className={cn("p-2 rounded-lg glass border border-jarvis-border", color)}>
            {icon}
          </div>
          <CardTitle>{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-8 w-24 bg-jarvis-border rounded animate-pulse" />
        ) : (
          <p className={cn("text-3xl font-bold font-mono", color)}>{value}</p>
        )}
        {change && (
          <p className={cn(
            "text-xs font-mono mt-1 flex items-center gap-1",
            positive ? "text-success" : "text-red-400"
          )}>
            <TrendingUp className={cn("w-3 h-3", !positive && "rotate-180")} />
            {change}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function StatsCards() {
  const { data: usage, isLoading } = useQuery({
    queryKey: ["usage-stats"],
    queryFn: () => api.analytics.usage().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="Total Messages"
        value={usage?.total_messages?.toLocaleString() ?? "0"}
        icon={<MessageSquare className="w-4 h-4" />}
        color="text-primary"
        loading={isLoading}
      />
      <StatCard
        title="Tokens Used"
        value={usage?.total_tokens ? `${(usage.total_tokens / 1000).toFixed(1)}K` : "0"}
        icon={<Cpu className="w-4 h-4" />}
        color="text-amber-400"
        loading={isLoading}
      />
      <StatCard
        title="Memories"
        value={usage?.total_memories?.toLocaleString() ?? "0"}
        icon={<Brain className="w-4 h-4" />}
        color="text-violet-400"
        loading={isLoading}
      />
      <StatCard
        title="Tasks Done"
        value={usage?.tasks_completed?.toLocaleString() ?? "0"}
        icon={<CheckCircle2 className="w-4 h-4" />}
        color="text-success"
        loading={isLoading}
      />
    </div>
  );
}
