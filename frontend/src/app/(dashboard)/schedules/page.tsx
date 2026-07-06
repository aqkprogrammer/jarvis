"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock,
  Plus,
  Play,
  Pencil,
  Trash2,
  Loader2,
  CalendarClock,
  Workflow as WorkflowIcon,
  Terminal,
  AlertTriangle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Header } from "@/components/dashboard/Header";
import { getApi } from "@/lib/api";
import { useUIStore } from "@/stores/uiStore";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/button";
import { describeCron, isValidCron } from "@/lib/cron";
import type { Schedule, ScheduleTargetType, Workflow } from "@/types";

const CRON_PRESETS = [
  { label: "Every hour", value: "0 * * * *" },
  { label: "Daily at 9:00 AM", value: "0 9 * * *" },
  { label: "Weekdays at 9:00 AM", value: "0 9 * * 1-5" },
  { label: "Every 15 minutes", value: "*/15 * * * *" },
] as const;

const CUSTOM = "custom";

function extractItems<T>(data: unknown): T[] {
  const d = data as { items?: T[]; data?: T[] } | T[];
  const items = Array.isArray(d) ? d : d?.items ?? d?.data ?? [];
  return Array.isArray(items) ? items : [];
}

interface ScheduleForm {
  name: string;
  preset: string;
  customCron: string;
  target_type: ScheduleTargetType;
  workflow_id: string;
  prompt: string;
}

const EMPTY_FORM: ScheduleForm = {
  name: "",
  preset: CRON_PRESETS[1].value,
  customCron: "",
  target_type: "workflow",
  workflow_id: "",
  prompt: "",
};

function formToCron(form: ScheduleForm): string {
  return form.preset === CUSTOM ? form.customCron.trim() : form.preset;
}

function scheduleToForm(schedule: Schedule): ScheduleForm {
  const matchesPreset = CRON_PRESETS.some((p) => p.value === schedule.cron);
  return {
    name: schedule.name,
    preset: matchesPreset ? schedule.cron : CUSTOM,
    customCron: matchesPreset ? "" : schedule.cron,
    target_type: schedule.target_type,
    workflow_id: schedule.workflow_id ?? "",
    prompt: schedule.prompt ?? "",
  };
}

function LastRunChip({ schedule }: { schedule: Schedule }) {
  if (!schedule.last_run_at) {
    return <Badge variant="muted" className="text-[9px]">never run</Badge>;
  }
  const status = schedule.last_status ?? "unknown";
  return (
    <span className="flex items-center gap-2">
      <Badge
        variant={status === "completed" ? "success" : status === "failed" ? "danger" : "muted"}
        dot
        className="text-[9px]"
      >
        {status}
      </Badge>
      <span className="text-[10px] font-mono text-jarvis-text-muted">
        {formatDistanceToNow(new Date(schedule.last_run_at), { addSuffix: true })}
      </span>
    </span>
  );
}

function ScheduleRow({
  schedule,
  workflowName,
  onToggle,
  onRunNow,
  onEdit,
  onDelete,
  isToggling,
  isRunning,
  isDeleting,
}: {
  schedule: Schedule;
  workflowName?: string;
  onToggle: () => void;
  onRunNow: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isToggling: boolean;
  isRunning: boolean;
  isDeleting: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      layout
      className={cn(
        "jarvis-card p-4 transition-all duration-200 hover:border-primary/30",
        !schedule.is_active && "opacity-70"
      )}
    >
      {/* Top row: name + actions */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/5 border border-primary/20 shrink-0">
          <CalendarClock className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-mono text-jarvis-text truncate">{schedule.name}</p>
          <p className="text-xs font-mono text-jarvis-text-muted mt-0.5">
            <span className="text-primary/80">{schedule.cron}</span>
            <span className="mx-1.5">·</span>
            {describeCron(schedule.cron)}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Active toggle */}
          <button
            onClick={onToggle}
            disabled={isToggling}
            title={schedule.is_active ? "Deactivate schedule" : "Activate schedule"}
            className={cn(
              "w-10 h-[22px] rounded-full transition-colors disabled:opacity-50",
              schedule.is_active ? "bg-primary/80" : "bg-jarvis-border"
            )}
          >
            <span
              className={cn(
                "block w-4 h-4 bg-white rounded-full mx-0.5 transition-transform",
                schedule.is_active ? "translate-x-5" : "translate-x-0"
              )}
            />
          </button>

          <button
            onClick={onRunNow}
            disabled={isRunning}
            title="Run now"
            className="p-2 rounded-lg text-jarvis-text-muted hover:text-emerald-400 hover:bg-emerald-500/5 transition-colors border border-transparent hover:border-emerald-500/20 disabled:opacity-50"
          >
            {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={onEdit}
            title="Edit schedule"
            className="p-2 rounded-lg text-jarvis-text-muted hover:text-primary hover:bg-primary/5 transition-colors border border-transparent hover:border-primary/20"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => {
              if (confirming) {
                onDelete();
                setConfirming(false);
              } else {
                setConfirming(true);
              }
            }}
            onMouseLeave={() => setConfirming(false)}
            disabled={isDeleting}
            title={confirming ? "Click again to confirm" : "Delete schedule"}
            className={cn(
              "flex items-center gap-1 p-2 rounded-lg transition-all",
              confirming
                ? "text-red-400 bg-red-500/10 border border-red-500/30"
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
      </div>

      {/* Bottom row: target + run info */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3 pl-11">
        <span className="flex items-center gap-1.5 text-[10px] font-mono text-jarvis-text-muted uppercase tracking-wider">
          Target
          {schedule.target_type === "workflow" ? (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/30 text-violet-300 normal-case">
              <WorkflowIcon className="w-2.5 h-2.5" />
              {workflowName ?? "Unknown workflow"}
            </span>
          ) : (
            <span
              title={schedule.prompt}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/5 border border-primary/20 text-primary/80 normal-case cursor-help max-w-56"
            >
              <Terminal className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">
                Prompt{schedule.prompt ? `: ${schedule.prompt}` : ""}
              </span>
            </span>
          )}
        </span>

        <span className="flex items-center gap-1.5 text-[10px] font-mono text-jarvis-text-muted uppercase tracking-wider">
          Last run <LastRunChip schedule={schedule} />
        </span>

        <span className="flex items-center gap-1.5 text-[10px] font-mono text-jarvis-text-muted uppercase tracking-wider">
          Next run
          <span className="text-jarvis-text normal-case">
            {schedule.is_active && schedule.next_run_at
              ? formatDistanceToNow(new Date(schedule.next_run_at), { addSuffix: true })
              : schedule.is_active
                ? "—"
                : "paused"}
          </span>
        </span>
      </div>
    </motion.div>
  );
}

export default function SchedulesPage() {
  const [modal, setModal] = useState<{ open: boolean; editing: Schedule | null }>({
    open: false,
    editing: null,
  });
  const [form, setForm] = useState<ScheduleForm>(EMPTY_FORM);
  const queryClient = useQueryClient();
  const { addNotification } = useUIStore();

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ["schedules"],
    queryFn: async () => {
      const response = await getApi().schedules.list();
      return extractItems<Schedule>(response.data);
    },
  });

  const { data: workflows = [] } = useQuery({
    queryKey: ["workflows"],
    queryFn: async () => {
      const response = await getApi().workflows.list();
      return extractItems<Workflow>(response.data);
    },
  });

  const workflowNames = useMemo(
    () => Object.fromEntries(workflows.map((w) => [w.id, w.name])),
    [workflows]
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["schedules"] });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        cron: formToCron(form),
        target_type: form.target_type,
        workflow_id: form.target_type === "workflow" ? form.workflow_id : undefined,
        prompt: form.target_type === "prompt" ? form.prompt.trim() : undefined,
      };
      if (modal.editing) {
        return getApi().schedules.update(modal.editing.id, payload);
      }
      return getApi().schedules.create(payload);
    },
    onSuccess: () => {
      invalidate();
      setModal({ open: false, editing: null });
      addNotification(
        "success",
        modal.editing ? "Schedule Updated" : "Schedule Created",
        `"${form.name.trim()}" saved successfully`
      );
    },
    onError: (error) => addNotification("error", "Save Failed", (error as Error).message),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => getApi().schedules.toggle(id),
    onSuccess: invalidate,
    onError: (error) => addNotification("error", "Toggle Failed", (error as Error).message),
  });

  const runNowMutation = useMutation({
    mutationFn: (id: string) => getApi().schedules.runNow(id),
    onSuccess: (_data, id) => {
      invalidate();
      const s = schedules.find((x) => x.id === id);
      addNotification("success", "Schedule Triggered", `"${s?.name ?? "Schedule"}" is running now`);
    },
    onError: (error) => addNotification("error", "Run Failed", (error as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => getApi().schedules.delete(id),
    onSuccess: invalidate,
    onError: (error) => addNotification("error", "Delete Failed", (error as Error).message),
  });

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, workflow_id: workflows[0]?.id ?? "" });
    setModal({ open: true, editing: null });
  };

  const openEdit = (schedule: Schedule) => {
    setForm(scheduleToForm(schedule));
    setModal({ open: true, editing: schedule });
  };

  const effectiveCron = formToCron(form);
  const cronValid = isValidCron(effectiveCron);
  const formValid =
    form.name.trim().length > 0 &&
    cronValid &&
    (form.target_type === "workflow" ? form.workflow_id.length > 0 : form.prompt.trim().length > 0);

  const activeCount = schedules.filter((s) => s.is_active).length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Schedules" subtitle="Cron-based automation for workflows and prompts" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs font-mono text-jarvis-text-muted">
            <span>
              <span className="text-primary font-semibold">{schedules.length}</span> schedule
              {schedules.length === 1 ? "" : "s"}
            </span>
            <span>
              <span className="text-success font-semibold">{activeCount}</span> active
            </span>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-mono hover:bg-primary/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            New Schedule
          </button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-jarvis-surface animate-pulse" />
            ))}
          </div>
        ) : schedules.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16">
            <Clock className="w-12 h-12 text-jarvis-text-muted/30" />
            <div className="text-center">
              <p className="text-jarvis-text-muted font-mono">No schedules yet</p>
              <p className="text-jarvis-text-muted/60 text-sm font-mono mt-1">
                Automate workflows and prompts on a cron schedule
              </p>
            </div>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-mono hover:bg-primary/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              New Schedule
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {schedules.map((schedule) => (
                <ScheduleRow
                  key={schedule.id}
                  schedule={schedule}
                  workflowName={schedule.workflow_id ? workflowNames[schedule.workflow_id] : undefined}
                  onToggle={() => toggleMutation.mutate(schedule.id)}
                  onRunNow={() => runNowMutation.mutate(schedule.id)}
                  onEdit={() => openEdit(schedule)}
                  onDelete={() => deleteMutation.mutate(schedule.id)}
                  isToggling={toggleMutation.isPending && toggleMutation.variables === schedule.id}
                  isRunning={runNowMutation.isPending && runNowMutation.variables === schedule.id}
                  isDeleting={deleteMutation.isPending && deleteMutation.variables === schedule.id}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Create / edit modal */}
      <AnimatePresence>
        {modal.open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && setModal({ open: false, editing: null })}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="glass-strong border border-jarvis-border rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
            >
              <h2 className="text-lg font-mono font-bold text-jarvis-text mb-4">
                {modal.editing ? "Edit Schedule" : "New Schedule"}
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-mono text-jarvis-text-muted uppercase tracking-wider block mb-1.5">
                    Name
                  </label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="jarvis-input w-full text-sm"
                    placeholder="e.g. Daily Morning Briefing"
                  />
                </div>

                <div>
                  <label className="text-xs font-mono text-jarvis-text-muted uppercase tracking-wider block mb-1.5">
                    Schedule
                  </label>
                  <select
                    value={form.preset}
                    onChange={(e) => setForm({ ...form, preset: e.target.value })}
                    className="jarvis-input w-full text-sm"
                  >
                    {CRON_PRESETS.map((p) => (
                      <option key={p.value} value={p.value} className="bg-jarvis-surface">
                        {p.label} ({p.value})
                      </option>
                    ))}
                    <option value={CUSTOM} className="bg-jarvis-surface">
                      Custom cron expression...
                    </option>
                  </select>

                  {form.preset === CUSTOM && (
                    <input
                      value={form.customCron}
                      onChange={(e) => setForm({ ...form, customCron: e.target.value })}
                      className={cn(
                        "jarvis-input w-full text-sm mt-2",
                        form.customCron.trim() && !cronValid && "!border-red-500/60"
                      )}
                      placeholder="minute hour day month weekday — e.g. 30 6 * * 1"
                    />
                  )}

                  <p
                    className={cn(
                      "flex items-center gap-1.5 text-[11px] font-mono mt-1.5",
                      cronValid ? "text-primary/80" : "text-red-400"
                    )}
                  >
                    {cronValid ? (
                      <>
                        <Clock className="w-3 h-3" />
                        {describeCron(effectiveCron)}
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-3 h-3" />
                        {effectiveCron ? "Invalid cron expression (5 fields required)" : "Enter a cron expression"}
                      </>
                    )}
                  </p>
                </div>

                <div>
                  <label className="text-xs font-mono text-jarvis-text-muted uppercase tracking-wider block mb-1.5">
                    Target
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { value: "workflow", label: "Run a workflow", icon: WorkflowIcon },
                        { value: "prompt", label: "Run a prompt", icon: Terminal },
                      ] as const
                    ).map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        onClick={() => setForm({ ...form, target_type: value })}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-mono transition-all",
                          form.target_type === value
                            ? "border-primary/50 bg-primary/10 text-primary"
                            : "border-jarvis-border glass text-jarvis-text-muted hover:border-primary/30"
                        )}
                      >
                        <Icon className="w-4 h-4" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {form.target_type === "workflow" ? (
                  <div>
                    <label className="text-xs font-mono text-jarvis-text-muted uppercase tracking-wider block mb-1.5">
                      Workflow
                    </label>
                    <select
                      value={form.workflow_id}
                      onChange={(e) => setForm({ ...form, workflow_id: e.target.value })}
                      className="jarvis-input w-full text-sm"
                    >
                      <option value="" className="bg-jarvis-surface">
                        Select a workflow...
                      </option>
                      {workflows.map((w) => (
                        <option key={w.id} value={w.id} className="bg-jarvis-surface">
                          {w.name}
                        </option>
                      ))}
                    </select>
                    {workflows.length === 0 && (
                      <p className="text-[11px] font-mono text-amber-400 mt-1.5">
                        No workflows available — create one on the Workflows page first.
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="text-xs font-mono text-jarvis-text-muted uppercase tracking-wider block mb-1.5">
                      Prompt
                    </label>
                    <textarea
                      value={form.prompt}
                      onChange={(e) => setForm({ ...form, prompt: e.target.value })}
                      className="jarvis-input w-full min-h-24 text-sm resize-none"
                      rows={4}
                      placeholder="What should JARVIS do on this schedule?"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 mt-6">
                <button
                  onClick={() => setModal({ open: false, editing: null })}
                  className="px-4 py-2 rounded-lg glass border border-jarvis-border text-sm font-mono text-jarvis-text-muted hover:text-primary transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => saveMutation.mutate()}
                  disabled={!formValid || saveMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-mono hover:bg-primary/20 transition-all disabled:opacity-50"
                >
                  {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {saveMutation.isPending
                    ? "Saving..."
                    : modal.editing
                      ? "Save Changes"
                      : "Create Schedule"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
