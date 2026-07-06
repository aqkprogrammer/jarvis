"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  MarkerType,
  type Edge,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Workflow as WorkflowIcon,
  Plus,
  Trash2,
  Loader2,
  ArrowLeft,
  Save,
  Play,
  X,
  ChevronDown,
  ChevronUp,
  Boxes,
  Clock3,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Header } from "@/components/dashboard/Header";
import { getApi } from "@/lib/api";
import { useUIStore } from "@/stores/uiStore";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/button";
import {
  workflowNodeTypes,
  NODE_META,
  type FlowNode,
  type FlowNodeData,
} from "@/components/workflows/FlowNodeCard";
import type {
  Workflow,
  WorkflowNode,
  WorkflowNodeType,
  WorkflowEdge,
  WorkflowRun,
  NodeResult,
  ConditionOp,
} from "@/types";

const AGENT_TYPES = ["planner", "research", "coding", "browser", "vision", "memory"] as const;

const DEFAULT_LABELS: Record<WorkflowNodeType, string> = {
  trigger: "Trigger",
  agent: "Agent",
  condition: "Condition",
  output: "Output",
};

const PALETTE: WorkflowNodeType[] = ["trigger", "agent", "condition", "output"];

// ─── helpers ──────────────────────────────────────────────────────────────────

function extractItems<T>(data: unknown): T[] {
  const d = data as { items?: T[]; data?: T[] } | T[];
  const items = Array.isArray(d) ? d : d?.items ?? d?.data ?? [];
  return Array.isArray(items) ? items : [];
}

function toFlowNodes(nodes: WorkflowNode[]): FlowNode[] {
  return nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: { x: n.position.x, y: n.position.y },
    data: {
      label: n.data.label,
      agent_type: n.data.agent_type,
      prompt: n.data.prompt,
      condition: n.data.condition,
    },
  }));
}

function toFlowEdges(edges: WorkflowEdge[]): Edge[] {
  return edges.map((e) => ({ id: e.id, source: e.source, target: e.target }));
}

function toApiNodes(nodes: FlowNode[]): WorkflowNode[] {
  return nodes.map((n) => ({
    id: n.id,
    type: n.type ?? "agent",
    position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
    data: {
      label: n.data.label,
      agent_type: n.data.agent_type,
      prompt: n.data.prompt,
      condition: n.data.condition,
    },
  }));
}

function toApiEdges(edges: Edge[]): WorkflowEdge[] {
  return edges.map((e) => ({ id: e.id, source: e.source, target: e.target }));
}

function newNodeId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatDuration(ms?: number): string {
  if (ms === undefined) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

// ─── List view ────────────────────────────────────────────────────────────────

function WorkflowCard({
  workflow,
  lastRun,
  onOpen,
  onDelete,
  isDeleting,
}: {
  workflow: Workflow;
  lastRun?: WorkflowRun;
  onOpen: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      layout
      onClick={onOpen}
      className="jarvis-card p-4 group cursor-pointer hover:border-primary/30 transition-all duration-200 hover:shadow-jarvis-sm"
    >
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/20 shrink-0">
          <WorkflowIcon className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-mono text-jarvis-text truncate" title={workflow.name}>
            {workflow.name}
          </p>
          <p className="text-xs font-mono text-jarvis-text-muted mt-0.5 line-clamp-2">
            {workflow.description || "No description"}
          </p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirming) {
              onDelete();
              setConfirming(false);
            } else {
              setConfirming(true);
            }
          }}
          onMouseLeave={() => setConfirming(false)}
          disabled={isDeleting}
          title={confirming ? "Click again to confirm" : "Delete workflow"}
          className={cn(
            "flex items-center gap-1 p-1.5 rounded-lg transition-all shrink-0 opacity-0 group-hover:opacity-100",
            confirming
              ? "text-red-400 bg-red-500/10 border border-red-500/30 opacity-100"
              : "text-jarvis-text-muted hover:text-red-400 hover:bg-red-500/5 border border-transparent"
          )}
        >
          {isDeleting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <>
              <Trash2 className="w-3.5 h-3.5" />
              {confirming && <span className="text-[10px] font-mono">Confirm?</span>}
            </>
          )}
        </button>
      </div>

      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[10px] font-mono text-jarvis-text-muted">
            <Boxes className="w-3 h-3" />
            {workflow.nodes.length} node{workflow.nodes.length === 1 ? "" : "s"}
          </span>
          {lastRun ? (
            <Badge
              variant={
                lastRun.status === "completed"
                  ? "success"
                  : lastRun.status === "failed"
                    ? "danger"
                    : "running"
              }
              dot
              className="text-[9px]"
            >
              {lastRun.status}
            </Badge>
          ) : (
            <Badge variant="muted" className="text-[9px]">
              never run
            </Badge>
          )}
        </div>
        <span className="flex items-center gap-1 text-[10px] font-mono text-jarvis-text-muted">
          <Clock3 className="w-3 h-3" />
          {formatDistanceToNow(new Date(workflow.updated_at), { addSuffix: true })}
        </span>
      </div>
    </motion.div>
  );
}

// ─── Node config panel ────────────────────────────────────────────────────────

function ConfigPanel({
  node,
  onChange,
  onDelete,
  onClose,
}: {
  node: FlowNode;
  onChange: (id: string, patch: Partial<FlowNodeData>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const nodeType: WorkflowNodeType = node.type ?? "agent";
  const meta = NODE_META[nodeType];
  const Icon = meta.icon;
  const condition = node.data.condition ?? { field: "output" as const, op: "contains" as const, value: "" };

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.15 }}
      className="w-80 shrink-0 border-l border-jarvis-border bg-jarvis-surface/60 backdrop-blur-sm p-4 overflow-y-auto"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={cn("p-1.5 rounded-md border", meta.chipBg, meta.border)}>
            <Icon className={cn("w-3.5 h-3.5", meta.text)} />
          </div>
          <span className="text-xs font-mono uppercase tracking-wider text-jarvis-text-muted">
            {meta.title} Config
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-jarvis-text-muted hover:text-primary hover:bg-primary/5 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-xs font-mono text-jarvis-text-muted uppercase tracking-wider block mb-1.5">
            Label
          </label>
          <input
            value={node.data.label}
            onChange={(e) => onChange(node.id, { label: e.target.value })}
            className="jarvis-input w-full text-sm"
            placeholder="Node label..."
          />
        </div>

        {nodeType === "agent" && (
          <>
            <div>
              <label className="text-xs font-mono text-jarvis-text-muted uppercase tracking-wider block mb-1.5">
                Agent Type
              </label>
              <select
                value={node.data.agent_type || "planner"}
                onChange={(e) => onChange(node.id, { agent_type: e.target.value })}
                className="jarvis-input w-full text-sm"
              >
                {AGENT_TYPES.map((t) => (
                  <option key={t} value={t} className="bg-jarvis-surface capitalize">
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-mono text-jarvis-text-muted uppercase tracking-wider block mb-1.5">
                Prompt
              </label>
              <textarea
                value={node.data.prompt || ""}
                onChange={(e) => onChange(node.id, { prompt: e.target.value })}
                className="jarvis-input w-full min-h-28 text-sm resize-none"
                rows={5}
                placeholder="Instructions for this agent. Use {input} to reference the incoming data..."
              />
              <p className="text-[10px] font-mono text-jarvis-text-muted mt-1">
                {"{input}"} is replaced with the previous node&apos;s output.
              </p>
            </div>
          </>
        )}

        {nodeType === "condition" && (
          <>
            <div>
              <label className="text-xs font-mono text-jarvis-text-muted uppercase tracking-wider block mb-1.5">
                Operator
              </label>
              <select
                value={condition.op}
                onChange={(e) =>
                  onChange(node.id, {
                    condition: { ...condition, op: e.target.value as ConditionOp },
                  })
                }
                className="jarvis-input w-full text-sm"
              >
                <option value="contains" className="bg-jarvis-surface">Output contains</option>
                <option value="not_contains" className="bg-jarvis-surface">Output does not contain</option>
                <option value="equals" className="bg-jarvis-surface">Output equals</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-mono text-jarvis-text-muted uppercase tracking-wider block mb-1.5">
                Value
              </label>
              <input
                value={condition.value}
                onChange={(e) =>
                  onChange(node.id, { condition: { ...condition, value: e.target.value } })
                }
                className="jarvis-input w-full text-sm"
                placeholder="Text to match..."
              />
              <p className="text-[10px] font-mono text-jarvis-text-muted mt-1">
                When the check fails, downstream nodes are skipped.
              </p>
            </div>
          </>
        )}

        <div className="pt-3 border-t border-jarvis-border">
          <button
            onClick={() => onDelete(node.id)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-red-500/30 text-red-400 text-xs font-mono hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete Node
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Run results panel ────────────────────────────────────────────────────────

function NodeResultRow({
  label,
  nodeType,
  result,
}: {
  label: string;
  nodeType: WorkflowNodeType;
  result: NodeResult;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = NODE_META[nodeType];
  const Icon = meta.icon;
  const text = result.output || result.error || "";
  const isLong = text.length > 140;

  return (
    <div className="jarvis-card p-3">
      <div className="flex items-center gap-2">
        <div className={cn("p-1 rounded border shrink-0", meta.chipBg, meta.border)}>
          <Icon className={cn("w-3 h-3", meta.text)} />
        </div>
        <span className="text-xs font-mono text-jarvis-text truncate flex-1">{label}</span>
        <span className="text-[10px] font-mono text-jarvis-text-muted shrink-0">
          {formatDuration(result.duration_ms)}
        </span>
        <Badge
          variant={
            result.status === "completed" ? "success" : result.status === "failed" ? "danger" : "muted"
          }
          dot
          className="text-[9px] shrink-0"
        >
          {result.status}
        </Badge>
      </div>
      {text && (
        <div className="mt-2">
          <p
            className={cn(
              "text-[11px] font-mono leading-relaxed whitespace-pre-wrap break-words",
              result.status === "failed" ? "text-red-400/90" : "text-jarvis-text-muted",
              !expanded && "line-clamp-2"
            )}
          >
            {text}
          </p>
          {isLong && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 mt-1 text-[10px] font-mono text-primary/80 hover:text-primary transition-colors"
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {expanded ? "Collapse" : "Expand"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function RunPanel({
  run,
  nodes,
  onClose,
}: {
  run: WorkflowRun;
  nodes: FlowNode[];
  onClose: () => void;
}) {
  // Show results in canvas-node order, then any orphaned results
  const rows = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const ordered: Array<{ id: string; label: string; nodeType: WorkflowNodeType; result: NodeResult }> = [];
    nodes.forEach((n) => {
      const result = run.node_results[n.id];
      if (result) {
        ordered.push({ id: n.id, label: n.data.label, nodeType: n.type ?? "agent", result });
      }
    });
    Object.entries(run.node_results).forEach(([id, result]) => {
      if (!byId.has(id)) ordered.push({ id, label: id, nodeType: "agent", result });
    });
    return ordered;
  }, [run, nodes]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ duration: 0.2 }}
      className="absolute top-0 right-0 bottom-0 w-96 max-w-full z-10 glass-strong border-l border-jarvis-border flex flex-col"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-jarvis-border">
        <div className="flex items-center gap-2.5">
          {run.status === "running" ? (
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
          ) : (
            <Play className="w-4 h-4 text-primary" />
          )}
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-jarvis-text">Run Results</p>
            <p className="text-[10px] font-mono text-jarvis-text-muted">
              started {formatDistanceToNow(new Date(run.started_at), { addSuffix: true })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={
              run.status === "completed" ? "success" : run.status === "failed" ? "danger" : "running"
            }
            dot
          >
            {run.status}
          </Badge>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-jarvis-text-muted hover:text-primary hover:bg-primary/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {run.error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs font-mono text-red-400">
            {run.error}
          </div>
        )}
        {rows.length === 0 ? (
          <p className="text-xs font-mono text-jarvis-text-muted text-center py-8">
            No node results yet...
          </p>
        ) : (
          rows.map((row) => (
            <NodeResultRow key={row.id} label={row.label} nodeType={row.nodeType} result={row.result} />
          ))
        )}
      </div>
    </motion.div>
  );
}

// ─── Builder view ─────────────────────────────────────────────────────────────

function WorkflowBuilder({ workflow, onBack }: { workflow: Workflow | null; onBack: () => void }) {
  const queryClient = useQueryClient();
  const { addNotification } = useUIStore();

  const [workflowId, setWorkflowId] = useState<string | null>(workflow?.id ?? null);
  const [name, setName] = useState(workflow?.name ?? "Untitled Workflow");
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(
    workflow
      ? toFlowNodes(workflow.nodes)
      : [{ id: newNodeId(), type: "trigger", position: { x: 80, y: 160 }, data: { label: "Trigger" } }]
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    workflow ? toFlowEdges(workflow.edges) : []
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [runModalOpen, setRunModalOpen] = useState(false);
  const [runInput, setRunInput] = useState("");
  const [activeRun, setActiveRun] = useState<WorkflowRun | null>(null);
  const [showRunPanel, setShowRunPanel] = useState(false);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge(connection, eds));
      setDirty(true);
    },
    [setEdges]
  );

  const addNode = useCallback(
    (type: WorkflowNodeType) => {
      const id = newNodeId();
      setNodes((nds) => {
        const offset = nds.length;
        const node: FlowNode = {
          id,
          type,
          position: { x: 120 + (offset % 4) * 80, y: 90 + (offset % 6) * 70 },
          data: {
            label: DEFAULT_LABELS[type],
            ...(type === "agent" ? { agent_type: "planner", prompt: "" } : {}),
            ...(type === "condition"
              ? { condition: { field: "output" as const, op: "contains" as const, value: "" } }
              : {}),
          },
        };
        return [...nds, node];
      });
      setSelectedId(id);
      setDirty(true);
    },
    [setNodes]
  );

  const updateNodeData = useCallback(
    (id: string, patch: Partial<FlowNodeData>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))
      );
      setDirty(true);
    },
    [setNodes]
  );

  const deleteNode = useCallback(
    (id: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      setSelectedId((sel) => (sel === id ? null : sel));
      setDirty(true);
    },
    [setNodes, setEdges]
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim() || "Untitled Workflow",
        description: workflow?.description,
        nodes: toApiNodes(nodes),
        edges: toApiEdges(edges),
      };
      const response = workflowId
        ? await getApi().workflows.update(workflowId, payload)
        : await getApi().workflows.create(payload);
      return response.data as Workflow;
    },
    onSuccess: (saved) => {
      setWorkflowId(saved.id);
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      addNotification("success", "Workflow Saved", `"${saved.name}" saved successfully`);
    },
    onError: (error) => addNotification("error", "Save Failed", (error as Error).message),
  });

  const runMutation = useMutation({
    mutationFn: async (input: string) => {
      if (!workflowId) throw new Error("Save the workflow before running it");
      const response = await getApi().workflows.run(workflowId, input);
      return response.data as WorkflowRun;
    },
    onSuccess: (run) => {
      setActiveRun(run);
      setShowRunPanel(true);
      setRunModalOpen(false);
      setRunInput("");
      queryClient.invalidateQueries({ queryKey: ["workflow-runs"] });
    },
    onError: (error) => addNotification("error", "Run Failed", (error as Error).message),
  });

  // Poll while a run is in progress (real backend returns "running" first)
  const { data: polledRun } = useQuery({
    queryKey: ["workflow-run", activeRun?.id],
    enabled: !!activeRun && activeRun.status === "running",
    queryFn: async () => {
      const response = await getApi().workflows.getRun(activeRun!.id);
      return response.data as WorkflowRun;
    },
    refetchInterval: (q) =>
      (q.state.data as WorkflowRun | undefined)?.status === "running" ? 1500 : false,
  });
  const displayRun = polledRun ?? activeRun;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-jarvis-border bg-jarvis-surface/80 backdrop-blur-sm">
        <button
          onClick={onBack}
          className="p-2 rounded-lg text-jarvis-text-muted hover:text-primary hover:bg-primary/5 transition-colors border border-transparent hover:border-primary/20"
          title="Back to workflows"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
          className="flex-1 min-w-0 max-w-md bg-transparent border border-transparent hover:border-jarvis-border focus:border-primary/40 focus:outline-none rounded-lg px-3 py-1.5 text-sm font-mono font-semibold text-jarvis-text tracking-wide transition-colors"
          placeholder="Workflow name..."
        />
        {dirty && (
          <Badge variant="warning" className="text-[9px]">
            unsaved
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-mono hover:bg-primary/20 transition-all disabled:opacity-50"
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save
          </button>
          <button
            onClick={() => setRunModalOpen(true)}
            disabled={!workflowId || runMutation.isPending}
            title={workflowId ? "Run this workflow" : "Save the workflow first"}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-mono hover:bg-emerald-500/20 transition-all disabled:opacity-50"
          >
            {runMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Run
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Node palette */}
        <div className="w-44 shrink-0 border-r border-jarvis-border bg-jarvis-surface/40 p-3 space-y-2">
          <p className="text-[10px] font-mono uppercase tracking-wider text-jarvis-text-muted px-1 mb-1">
            Node Palette
          </p>
          {PALETTE.map((type) => {
            const meta = NODE_META[type];
            const Icon = meta.icon;
            return (
              <button
                key={type}
                onClick={() => addNode(type)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border bg-jarvis-surface/60 transition-all hover:shadow-jarvis-sm hover:scale-[1.02]",
                  meta.border
                )}
                title={`Add ${meta.title.toLowerCase()} node`}
              >
                <Icon className={cn("w-4 h-4 shrink-0", meta.text)} />
                <span className="text-xs font-mono text-jarvis-text">{meta.title}</span>
                <Plus className="w-3 h-3 text-jarvis-text-muted ml-auto" />
              </button>
            );
          })}
          <p className="text-[9px] font-mono text-jarvis-text-muted/70 px-1 pt-2 leading-relaxed">
            Drag between handles to connect. Backspace deletes selection.
          </p>
        </div>

        {/* Canvas */}
        <div className="flex-1 relative min-w-0">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={(changes) => {
              onNodesChange(changes);
              if (changes.some((c) => c.type === "remove" || c.type === "position")) setDirty(true);
            }}
            onEdgesChange={(changes) => {
              onEdgesChange(changes);
              if (changes.some((c) => c.type === "remove")) setDirty(true);
            }}
            onConnect={onConnect}
            nodeTypes={workflowNodeTypes}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onPaneClick={() => setSelectedId(null)}
            deleteKeyCode={["Backspace", "Delete"]}
            colorMode="dark"
            fitView
            fitViewOptions={{ padding: 0.25, maxZoom: 1.1 }}
            minZoom={0.3}
            defaultEdgeOptions={{
              animated: true,
              style: { stroke: "#00D4FF", strokeWidth: 1.5 },
              markerEnd: { type: MarkerType.ArrowClosed, color: "#00D4FF" },
            }}
            className="!bg-jarvis-bg"
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="#12314F" />
            <Controls
              position="bottom-left"
              className="!bg-jarvis-surface !border !border-jarvis-border !rounded-lg !shadow-jarvis-sm overflow-hidden"
            />
          </ReactFlow>

          <AnimatePresence>
            {showRunPanel && displayRun && (
              <RunPanel run={displayRun} nodes={nodes} onClose={() => setShowRunPanel(false)} />
            )}
          </AnimatePresence>
        </div>

        {/* Config panel */}
        <AnimatePresence>
          {selectedNode && (
            <ConfigPanel
              key={selectedNode.id}
              node={selectedNode}
              onChange={updateNodeData}
              onDelete={deleteNode}
              onClose={() => setSelectedId(null)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Run input modal */}
      <AnimatePresence>
        {runModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && setRunModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="glass-strong border border-jarvis-border rounded-2xl p-6 w-full max-w-lg"
            >
              <h2 className="text-lg font-mono font-bold text-jarvis-text mb-1">Run Workflow</h2>
              <p className="text-xs font-mono text-jarvis-text-muted mb-4">
                Provide the trigger input that starts this workflow.
              </p>
              <textarea
                value={runInput}
                onChange={(e) => setRunInput(e.target.value)}
                autoFocus
                className="jarvis-input w-full min-h-24 text-sm resize-none"
                rows={4}
                placeholder="e.g. Review PR #482: telemetry pipeline refactor..."
              />
              <div className="flex items-center justify-end gap-3 mt-5">
                <button
                  onClick={() => setRunModalOpen(false)}
                  className="px-4 py-2 rounded-lg glass border border-jarvis-border text-sm font-mono text-jarvis-text-muted hover:text-primary transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => runMutation.mutate(runInput.trim())}
                  disabled={runMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-mono hover:bg-emerald-500/20 transition-all disabled:opacity-50"
                >
                  {runMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  {runMutation.isPending ? "Running..." : "Run"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorkflowsPage() {
  const [builder, setBuilder] = useState<{ open: boolean; workflow: Workflow | null }>({
    open: false,
    workflow: null,
  });
  const queryClient = useQueryClient();
  const { addNotification } = useUIStore();

  const { data: workflows = [], isLoading } = useQuery({
    queryKey: ["workflows"],
    queryFn: async () => {
      const response = await getApi().workflows.list();
      return extractItems<Workflow>(response.data);
    },
  });

  const { data: lastRuns = {} } = useQuery({
    queryKey: ["workflow-runs", workflows.map((w) => w.id).join(",")],
    enabled: workflows.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        workflows.map(async (w) => {
          try {
            const response = await getApi().workflows.runs(w.id);
            const runs = extractItems<WorkflowRun>(response.data);
            return [w.id, runs[0]] as const;
          } catch {
            return [w.id, undefined] as const;
          }
        })
      );
      return Object.fromEntries(entries) as Record<string, WorkflowRun | undefined>;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => getApi().workflows.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflows"] }),
    onError: (error) => addNotification("error", "Delete Failed", (error as Error).message),
  });

  if (builder.open) {
    return (
      <WorkflowBuilder
        workflow={builder.workflow}
        onBack={() => setBuilder({ open: false, workflow: null })}
      />
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Workflows" subtitle="Visual multi-agent pipelines" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs font-mono text-jarvis-text-muted">
            <span>
              <span className="text-primary font-semibold">{workflows.length}</span> workflow
              {workflows.length === 1 ? "" : "s"}
            </span>
          </div>
          <button
            onClick={() => setBuilder({ open: true, workflow: null })}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-mono hover:bg-primary/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            New Workflow
          </button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 rounded-xl bg-jarvis-surface animate-pulse" />
            ))}
          </div>
        ) : workflows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16">
            <WorkflowIcon className="w-12 h-12 text-jarvis-text-muted/30" />
            <div className="text-center">
              <p className="text-jarvis-text-muted font-mono">No workflows yet</p>
              <p className="text-jarvis-text-muted/60 text-sm font-mono mt-1">
                Build your first multi-agent pipeline
              </p>
            </div>
            <button
              onClick={() => setBuilder({ open: true, workflow: null })}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-mono hover:bg-primary/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              New Workflow
            </button>
          </div>
        ) : (
          <motion.div layout className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {workflows.map((wf) => (
                <WorkflowCard
                  key={wf.id}
                  workflow={wf}
                  lastRun={lastRuns[wf.id]}
                  onOpen={() => setBuilder({ open: true, workflow: wf })}
                  onDelete={() => deleteMutation.mutate(wf.id)}
                  isDeleting={deleteMutation.isPending && deleteMutation.variables === wf.id}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  );
}
