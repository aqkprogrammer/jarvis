"use client";

import { useEffect, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { ChevronDown, ChevronLeft, ChevronRight, ScrollText, Search } from "lucide-react";
import { Header } from "@/components/dashboard/Header";
import { ActionChip } from "@/components/audit/ActionChip";
import { getApi } from "@/lib/api";
import { cn } from "@/components/ui/button";
import type { AuditLog } from "@/types";

const PAGE_SIZE = 20;

const ACTION_PREFIXES = [
  "auth",
  "document",
  "workflow",
  "schedule",
  "apikey",
  "integration",
  "workspace",
] as const;

export default function AuditPage() {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Debounce the search input into the query key
  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Changing any filter resets pagination
  useEffect(() => {
    setOffset(0);
  }, [q, action, from, to]);

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", q, action, from, to, offset],
    queryFn: async () => {
      const response = await getApi().audit.list({
        q: q || undefined,
        action: action || undefined,
        from: from || undefined,
        to: to || undefined,
        limit: PAGE_SIZE,
        offset,
      });
      return response.data as { items: AuditLog[]; total: number };
    },
    placeholderData: keepPreviousData,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const rangeEnd = Math.min(offset + PAGE_SIZE, total);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Audit Log" subtitle="A trail of every action taken on your account" />

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Filter bar */}
        <div className="jarvis-card p-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-jarvis-text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search actions, resources, details..."
              className="jarvis-input w-full pl-9 pr-3 py-2 text-xs font-mono"
            />
          </div>

          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="jarvis-input py-2 px-2 text-xs font-mono"
          >
            <option value="">All actions</option>
            {ACTION_PREFIXES.map((prefix) => (
              <option key={prefix} value={prefix}>
                {prefix}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-xs font-mono text-jarvis-text-muted">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="jarvis-input py-1.5 px-2 text-xs font-mono"
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-mono text-jarvis-text-muted">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="jarvis-input py-1.5 px-2 text-xs font-mono"
            />
          </label>
        </div>

        {/* Event table */}
        <div className="jarvis-card overflow-hidden">
          {/* Column headers */}
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-jarvis-border text-[10px] font-mono uppercase tracking-widest text-jarvis-text-muted">
            <span className="w-28 shrink-0">Time</span>
            <span className="w-44 shrink-0">Action</span>
            <span className="w-24 shrink-0 hidden sm:block">Resource</span>
            <span className="flex-1 min-w-0 hidden md:block">Resource ID</span>
            <span className="w-28 shrink-0 hidden lg:block">IP</span>
            <span className="w-4 shrink-0" />
          </div>

          {isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-10 rounded-lg bg-jarvis-surface animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="p-10 text-center">
              <ScrollText className="w-8 h-8 text-jarvis-text-muted mx-auto mb-3 opacity-50" />
              <p className="text-sm font-mono text-jarvis-text-muted">
                No audit events match the current filters.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-jarvis-border/50">
              {items.map((log) => {
                const expanded = expandedId === log.id;
                return (
                  <div key={log.id}>
                    <button
                      onClick={() => setExpandedId(expanded ? null : log.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-primary/[0.03] transition-colors"
                    >
                      <span
                        title={new Date(log.created_at).toLocaleString()}
                        className="w-28 shrink-0 text-[11px] font-mono text-jarvis-text-muted"
                      >
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                      </span>
                      <span className="w-44 shrink-0 overflow-hidden">
                        <ActionChip action={log.action} />
                      </span>
                      <span className="w-24 shrink-0 hidden sm:block text-xs font-mono text-jarvis-text">
                        {log.resource_type}
                      </span>
                      <span className="flex-1 min-w-0 hidden md:block truncate text-xs font-mono text-jarvis-text-muted">
                        {log.resource_id ?? "—"}
                      </span>
                      <span className="w-28 shrink-0 hidden lg:block text-xs font-mono text-jarvis-text-muted">
                        {log.ip ?? "—"}
                      </span>
                      <ChevronDown
                        className={cn(
                          "w-4 h-4 shrink-0 text-jarvis-text-muted transition-transform duration-200",
                          expanded && "rotate-180 text-primary"
                        )}
                      />
                    </button>
                    <AnimatePresence initial={false}>
                      {expanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4">
                            <pre className="bg-black/40 border border-jarvis-border rounded-lg p-3 text-xs font-mono text-jarvis-text overflow-x-auto">
                              {log.detail
                                ? JSON.stringify(log.detail, null, 2)
                                : "No detail recorded for this event."}
                            </pre>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-jarvis-border">
            <span className="text-xs font-mono text-jarvis-text-muted">
              {total === 0 ? "No events" : `Showing ${offset + 1}–${rangeEnd} of ${total}`}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-jarvis-border text-xs font-mono text-jarvis-text-muted hover:text-primary hover:border-primary/40 transition-all disabled:opacity-40 disabled:pointer-events-none"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Prev
              </button>
              <button
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-jarvis-border text-xs font-mono text-jarvis-text-muted hover:text-primary hover:border-primary/40 transition-all disabled:opacity-40 disabled:pointer-events-none"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
