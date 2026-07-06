"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Bot, Play, Square, RefreshCw, CheckCircle2, AlertCircle, Clock, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { Agent, AgentStatus as AgentStatusType } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/components/ui/button";

const statusConfig: Record<AgentStatusType, { variant: "running" | "success" | "danger" | "warning" | "offline"; label: string }> = {
  idle: { variant: "success", label: "Idle" },
  running: { variant: "running", label: "Running" },
  paused: { variant: "warning", label: "Paused" },
  error: { variant: "danger", label: "Error" },
  offline: { variant: "offline", label: "Offline" },
};

interface AgentCardProps {
  agent: Agent;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
}

function AgentCard({ agent, onStart, onStop }: AgentCardProps) {
  const config = statusConfig[agent.status];
  const isRunning = agent.status === "running";

  return (
    <Card className="hover:border-primary/20 transition-all">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-xl border flex items-center justify-center",
              isRunning
                ? "bg-primary/10 border-primary/30 animate-pulse-glow"
                : "glass border-jarvis-border"
            )}>
              <Bot className={cn("w-5 h-5", isRunning ? "text-primary" : "text-jarvis-text-muted")} />
            </div>
            <div>
              <h3 className="text-sm font-mono font-semibold text-jarvis-text">{agent.name}</h3>
              <p className="text-xs text-jarvis-text-muted font-mono">{agent.type}</p>
            </div>
          </div>
          <Badge variant={config.variant} dot>{config.label}</Badge>
        </div>

        <p className="text-xs text-jarvis-text-muted font-mono mb-4 leading-relaxed">
          {agent.description}
        </p>

        {/* Capabilities */}
        {agent.capabilities.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {agent.capabilities.slice(0, 4).map((cap) => (
              <span key={cap} className="px-2 py-0.5 rounded text-xs font-mono bg-primary/5 border border-primary/15 text-primary/70">
                {cap}
              </span>
            ))}
            {agent.capabilities.length > 4 && (
              <span className="px-2 py-0.5 rounded text-xs font-mono text-jarvis-text-muted">
                +{agent.capabilities.length - 4} more
              </span>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="text-center">
            <p className="text-lg font-bold font-mono text-success">{agent.tasks_completed}</p>
            <p className="text-xs font-mono text-jarvis-text-muted">Completed</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold font-mono text-red-400">{agent.tasks_failed}</p>
            <p className="text-xs font-mono text-jarvis-text-muted">Failed</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold font-mono text-primary">
              {Math.floor(agent.uptime_seconds / 3600)}h
            </p>
            <p className="text-xs font-mono text-jarvis-text-muted">Uptime</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {isRunning ? (
            <button
              onClick={() => onStop(agent.id)}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-mono hover:bg-red-500/20 transition-all"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop Agent
            </button>
          ) : (
            <button
              onClick={() => onStart(agent.id)}
              disabled={agent.status === "offline"}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs font-mono hover:bg-primary/20 transition-all disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Start Agent
            </button>
          )}
        </div>

        {agent.last_active && (
          <p className="text-xs font-mono text-jarvis-text-muted mt-2 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Last active: {new Date(agent.last_active).toLocaleString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function AgentStatus() {
  const queryClient = useQueryClient();

  const { data: agentsData, isLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.agents.list().then((r) => r.data),
    refetchInterval: 10000,
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => api.agents.start(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agents"] }),
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => api.agents.stop(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agents"] }),
  });

  const agents: Agent[] = agentsData?.data || agentsData || [];
  const runningCount = agents.filter((a) => a.status === "running").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-mono font-semibold text-jarvis-text-muted uppercase tracking-wider">Agent Fleet</h2>
          <Badge variant={runningCount > 0 ? "running" : "muted"} dot>
            {runningCount}/{agents.length} Active
          </Badge>
        </div>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ["agents"] })}
          className="p-2 rounded-lg text-jarvis-text-muted hover:text-primary transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-64 rounded-xl bg-jarvis-surface animate-pulse" />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <Bot className="w-12 h-12 text-jarvis-text-muted/30" />
          <p className="text-jarvis-text-muted font-mono">No agents configured</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onStart={(id) => startMutation.mutate(id)}
              onStop={(id) => stopMutation.mutate(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
