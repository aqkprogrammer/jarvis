"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Zap, Bot, GitBranch, Flag, type LucideIcon } from "lucide-react";
import { cn } from "@/components/ui/button";
import type { WorkflowNodeCondition, WorkflowNodeType } from "@/types";

/** React Flow node data — mirrors WorkflowNodeData (type alias so it satisfies Record<string, unknown>) */
export type FlowNodeData = {
  label: string;
  agent_type?: string;
  prompt?: string;
  condition?: WorkflowNodeCondition;
};

export type FlowNode = Node<FlowNodeData, WorkflowNodeType>;

export const NODE_META: Record<
  WorkflowNodeType,
  {
    icon: LucideIcon;
    title: string;
    border: string;
    text: string;
    chipBg: string;
    handle: string;
  }
> = {
  trigger: {
    icon: Zap,
    title: "Trigger",
    border: "border-cyan-400/60",
    text: "text-cyan-300",
    chipBg: "bg-cyan-500/10",
    handle: "!border-cyan-400",
  },
  agent: {
    icon: Bot,
    title: "Agent",
    border: "border-violet-500/60",
    text: "text-violet-300",
    chipBg: "bg-violet-500/10",
    handle: "!border-violet-400",
  },
  condition: {
    icon: GitBranch,
    title: "Condition",
    border: "border-amber-500/60",
    text: "text-amber-300",
    chipBg: "bg-amber-500/10",
    handle: "!border-amber-400",
  },
  output: {
    icon: Flag,
    title: "Output",
    border: "border-emerald-500/60",
    text: "text-emerald-300",
    chipBg: "bg-emerald-500/10",
    handle: "!border-emerald-400",
  },
};

const OP_LABELS: Record<WorkflowNodeCondition["op"], string> = {
  contains: "contains",
  not_contains: "does not contain",
  equals: "equals",
};

export function FlowNodeCard({ data, type, selected }: NodeProps<FlowNode>) {
  const nodeType: WorkflowNodeType = type ?? "agent";
  const meta = NODE_META[nodeType];
  const Icon = meta.icon;

  return (
    <div
      className={cn(
        "rounded-lg border bg-jarvis-surface/95 backdrop-blur px-3 py-2.5 min-w-[160px] max-w-[220px] shadow-lg transition-shadow",
        meta.border,
        selected && "ring-2 ring-primary/50 shadow-jarvis-sm"
      )}
    >
      {nodeType !== "trigger" && (
        <Handle
          type="target"
          position={Position.Left}
          className={cn("!w-2.5 !h-2.5 !bg-jarvis-bg !border-2", meta.handle)}
        />
      )}

      <div className="flex items-center gap-2">
        <div className={cn("p-1.5 rounded-md border shrink-0", meta.chipBg, meta.border)}>
          <Icon className={cn("w-3.5 h-3.5", meta.text)} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-mono text-jarvis-text truncate">{data.label}</p>
          <p className={cn("text-[9px] font-mono uppercase tracking-wider truncate", meta.text)}>
            {meta.title}
            {nodeType === "agent" && data.agent_type ? ` · ${data.agent_type}` : ""}
          </p>
        </div>
      </div>

      {nodeType === "condition" && data.condition && (
        <p className="mt-1.5 text-[9px] font-mono text-jarvis-text-muted truncate">
          output {OP_LABELS[data.condition.op]} &quot;{data.condition.value || "…"}&quot;
        </p>
      )}

      {nodeType !== "output" && (
        <Handle
          type="source"
          position={Position.Right}
          className={cn("!w-2.5 !h-2.5 !bg-jarvis-bg !border-2", meta.handle)}
        />
      )}
    </div>
  );
}

/** Stable nodeTypes map — every workflow node type renders through FlowNodeCard. */
export const workflowNodeTypes = {
  trigger: FlowNodeCard,
  agent: FlowNodeCard,
  condition: FlowNodeCard,
  output: FlowNodeCard,
};
