"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, CheckSquare, Clock, AlertCircle, X,
  ChevronDown, Filter, RefreshCw, Trash2
} from "lucide-react";
import { Header } from "@/components/dashboard/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { Task, TaskStatus, TaskPriority } from "@/types";
import { cn } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

const statusConfig: Record<TaskStatus, { variant: "muted" | "running" | "success" | "danger" | "warning"; label: string; icon: React.ReactNode }> = {
  pending: { variant: "muted", label: "Pending", icon: <Clock className="w-3 h-3" /> },
  running: { variant: "running", label: "Running", icon: <RefreshCw className="w-3 h-3 animate-spin" /> },
  completed: { variant: "success", label: "Done", icon: <CheckSquare className="w-3 h-3" /> },
  failed: { variant: "danger", label: "Failed", icon: <AlertCircle className="w-3 h-3" /> },
  cancelled: { variant: "muted", label: "Cancelled", icon: <X className="w-3 h-3" /> },
  paused: { variant: "warning", label: "Paused", icon: <Clock className="w-3 h-3" /> },
};

const priorityConfig: Record<TaskPriority, { color: string; label: string }> = {
  low: { color: "text-jarvis-text-muted", label: "Low" },
  medium: { color: "text-amber-400", label: "Medium" },
  high: { color: "text-orange-400", label: "High" },
  critical: { color: "text-red-400", label: "Critical" },
};

function TaskCard({ task, onDelete, onCancel }: { task: Task; onDelete: (id: string) => void; onCancel: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const status = statusConfig[task.status];
  const priority = priorityConfig[task.priority];

  return (
    <Card className="hover:border-primary/20 transition-all">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            <Badge variant={status.variant} dot>
              <span className="flex items-center gap-1">
                {status.icon}
                {status.label}
              </span>
            </Badge>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-mono font-semibold text-jarvis-text truncate">{task.title}</h3>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={cn("text-xs font-mono", priority.color)}>{priority.label}</span>
                {(task.status === "pending" || task.status === "running") && (
                  <button
                    onClick={() => onCancel(task.id)}
                    className="p-1 rounded text-jarvis-text-muted hover:text-amber-400 transition-colors"
                    title="Cancel"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                {(task.status === "completed" || task.status === "failed" || task.status === "cancelled") && (
                  <button
                    onClick={() => onDelete(task.id)}
                    className="p-1 rounded text-jarvis-text-muted hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <p className="text-xs text-jarvis-text-muted font-mono mt-1 line-clamp-2">{task.description}</p>

            {/* Progress bar */}
            {(task.status === "running" || task.status === "completed") && (
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono text-jarvis-text-muted">Progress</span>
                  <span className="text-xs font-mono text-primary">{task.progress}%</span>
                </div>
                <div className="h-1.5 bg-jarvis-border rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-primary rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${task.progress}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
            )}

            {/* Steps */}
            {task.steps.length > 0 && (
              <div className="mt-3">
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="flex items-center gap-1 text-xs font-mono text-jarvis-text-muted hover:text-primary transition-colors"
                >
                  <ChevronDown className={cn("w-3 h-3 transition-transform", expanded && "rotate-180")} />
                  {task.steps.length} steps
                </button>
                <AnimatePresence>
                  {expanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="mt-2 space-y-1.5 overflow-hidden"
                    >
                      {task.steps.map((step, i) => (
                        <div key={step.id} className="flex items-start gap-2 text-xs font-mono">
                          <span className={cn(
                            "mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold",
                            step.status === "completed" ? "bg-success/10 text-success border border-success/30" :
                            step.status === "running" ? "bg-primary/10 text-primary border border-primary/30" :
                            step.status === "failed" ? "bg-red-500/10 text-red-400 border border-red-500/30" :
                            "bg-jarvis-surface text-jarvis-text-muted border border-jarvis-border"
                          )}>
                            {i + 1}
                          </span>
                          <span className={cn(
                            step.status === "completed" ? "text-jarvis-text-muted line-through" : "text-jarvis-text"
                          )}>
                            {step.description}
                          </span>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            <div className="flex items-center gap-3 mt-3 text-xs font-mono text-jarvis-text-muted">
              <span>{formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}</span>
              {task.tags.map((tag) => (
                <span key={tag} className="text-primary/60">#{tag}</span>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TasksPage() {
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [showCreate, setShowCreate] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", description: "", priority: "medium" as TaskPriority });

  const queryClient = useQueryClient();

  const { data: tasksData, isLoading } = useQuery({
    queryKey: ["tasks", statusFilter],
    queryFn: () =>
      api.tasks.list({
        status: statusFilter !== "all" ? statusFilter : undefined,
        per_page: 50,
      }).then((r) => r.data),
    refetchInterval: 5000,
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof newTask) => api.tasks.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setShowCreate(false);
      setNewTask({ title: "", description: "", priority: "medium" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.tasks.cancel(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.tasks.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const tasks: Task[] = tasksData?.data || tasksData || [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Tasks" subtitle="Agent task queue and history" />
      <div className="flex-1 overflow-y-auto p-6">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-jarvis-text-muted" />
            {(["all", "pending", "running", "completed", "failed"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-mono border transition-all capitalize",
                  statusFilter === s
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "glass border-jarvis-border text-jarvis-text-muted hover:text-primary hover:border-primary/20"
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-mono hover:bg-primary/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            New Task
          </button>
        </div>

        {/* Tasks */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-jarvis-surface animate-pulse" />)}
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16">
            <CheckSquare className="w-12 h-12 text-jarvis-text-muted/30" />
            <div className="text-center">
              <p className="text-jarvis-text-muted font-mono">No tasks found</p>
              <p className="text-jarvis-text-muted/60 text-sm font-mono mt-1">Create a task to get started</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {tasks.map((task) => (
                <motion.div key={task.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <TaskCard
                    task={task}
                    onDelete={(id) => deleteMutation.mutate(id)}
                    onCancel={(id) => cancelMutation.mutate(id)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Create modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && setShowCreate(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="glass-strong border border-jarvis-border rounded-2xl p-6 w-full max-w-lg"
            >
              <h2 className="text-lg font-mono font-bold text-jarvis-text mb-4">New Task</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-mono text-jarvis-text-muted uppercase tracking-wider block mb-1.5">Title</label>
                  <input
                    value={newTask.title}
                    onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                    className="jarvis-input w-full text-sm"
                    placeholder="Task name..."
                  />
                </div>
                <div>
                  <label className="text-xs font-mono text-jarvis-text-muted uppercase tracking-wider block mb-1.5">Description</label>
                  <textarea
                    value={newTask.description}
                    onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                    className="jarvis-input w-full min-h-20 text-sm resize-none"
                    placeholder="Describe what needs to be done..."
                    rows={3}
                  />
                </div>
                <div>
                  <label className="text-xs font-mono text-jarvis-text-muted uppercase tracking-wider block mb-1.5">Priority</label>
                  <select
                    value={newTask.priority}
                    onChange={(e) => setNewTask({ ...newTask, priority: e.target.value as TaskPriority })}
                    className="jarvis-input w-full text-sm"
                  >
                    <option value="low" className="bg-jarvis-surface">Low</option>
                    <option value="medium" className="bg-jarvis-surface">Medium</option>
                    <option value="high" className="bg-jarvis-surface">High</option>
                    <option value="critical" className="bg-jarvis-surface">Critical</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 mt-6">
                <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg glass border border-jarvis-border text-sm font-mono text-jarvis-text-muted hover:text-primary transition-colors">Cancel</button>
                <button
                  onClick={() => createMutation.mutate(newTask)}
                  disabled={!newTask.title || createMutation.isPending}
                  className="px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-mono hover:bg-primary/20 transition-all disabled:opacity-50"
                >
                  {createMutation.isPending ? "Creating..." : "Create Task"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
