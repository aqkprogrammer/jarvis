"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Plus, Brain, Star, Calendar, Hash,
  Trash2, Edit3, Filter, LayoutGrid, List,
  Lightbulb, Heart, Clock, Zap
} from "lucide-react";
import { api } from "@/lib/api";
import { Memory, MemoryType } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

const typeConfig: Record<MemoryType, { icon: React.ReactNode; color: string; label: string }> = {
  fact: { icon: <Lightbulb className="w-3.5 h-3.5" />, color: "text-amber-400", label: "Fact" },
  preference: { icon: <Heart className="w-3.5 h-3.5" />, color: "text-pink-400", label: "Preference" },
  event: { icon: <Calendar className="w-3.5 h-3.5" />, color: "text-blue-400", label: "Event" },
  skill: { icon: <Zap className="w-3.5 h-3.5" />, color: "text-violet-400", label: "Skill" },
  context: { icon: <Brain className="w-3.5 h-3.5" />, color: "text-primary", label: "Context" },
};

interface MemoryCardProps {
  memory: Memory;
  onDelete: (id: string) => void;
  onEdit: (memory: Memory) => void;
}

function MemoryCard({ memory, onDelete, onEdit }: MemoryCardProps) {
  const config = typeConfig[memory.type];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      layout
    >
      <Card className="group hover:border-primary/20 transition-all duration-200 hover:shadow-jarvis-sm">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className={cn("p-1.5 rounded-lg glass border border-jarvis-border", config.color)}>
                {config.icon}
              </span>
              <span className={cn("text-xs font-mono font-semibold uppercase tracking-wider", config.color)}>
                {config.label}
              </span>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onEdit(memory)}
                className="p-1.5 rounded-lg text-jarvis-text-muted hover:text-primary hover:bg-primary/5 transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onDelete(memory.id)}
                className="p-1.5 rounded-lg text-jarvis-text-muted hover:text-red-400 hover:bg-red-500/5 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <p className="text-sm text-jarvis-text font-mono leading-relaxed mb-3">
            {memory.content}
          </p>

          {/* Tags */}
          {memory.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {memory.tags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono bg-primary/5 border border-primary/15 text-primary/70"
                >
                  <Hash className="w-2.5 h-2.5" />
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between text-xs font-mono text-jarvis-text-muted">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDistanceToNow(new Date(memory.created_at), { addSuffix: true })}
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-0.5">
                <Star className="w-3 h-3 text-amber-400/60" />
                {memory.importance}/5
              </span>
              <span>{memory.access_count} accesses</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function MemoryExplorer() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<MemoryType | "all">("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newMemory, setNewMemory] = useState({ content: "", type: "fact" as MemoryType, importance: 3, tags: "" });

  const queryClient = useQueryClient();

  const { data: memoriesData, isLoading } = useQuery({
    queryKey: ["memories", search, typeFilter],
    queryFn: () =>
      api.memory.list({
        search: search || undefined,
        type: typeFilter !== "all" ? typeFilter : undefined,
        per_page: 50,
      }).then((r) => r.data),
    staleTime: 30 * 1000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.memory.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["memories"] }),
  });

  const createMutation = useMutation({
    mutationFn: (data: { content: string; type: string; importance: number; tags: string[] }) =>
      api.memory.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["memories"] });
      setShowCreateModal(false);
      setNewMemory({ content: "", type: "fact", importance: 3, tags: "" });
    },
  });

  const memories: Memory[] = memoriesData?.data || memoriesData || [];

  const handleCreate = () => {
    createMutation.mutate({
      content: newMemory.content,
      type: newMemory.type,
      importance: newMemory.importance,
      tags: newMemory.tags.split(",").map((t) => t.trim()).filter(Boolean),
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-jarvis-text-muted pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search memories..."
            className="jarvis-input w-full pl-10 text-sm"
          />
        </div>

        {/* Type filter */}
        <div className="flex items-center gap-1.5">
          <Filter className="w-4 h-4 text-jarvis-text-muted" />
          {(["all", "fact", "preference", "event", "skill", "context"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-mono border transition-all capitalize",
                typeFilter === type
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "glass border-jarvis-border text-jarvis-text-muted hover:text-primary hover:border-primary/20"
              )}
            >
              {type}
            </button>
          ))}
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-1 glass border border-jarvis-border rounded-lg p-1">
          <button
            onClick={() => setViewMode("grid")}
            className={cn("p-1.5 rounded transition-colors", viewMode === "grid" ? "text-primary bg-primary/10" : "text-jarvis-text-muted hover:text-primary")}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={cn("p-1.5 rounded transition-colors", viewMode === "list" ? "text-primary bg-primary/10" : "text-jarvis-text-muted hover:text-primary")}
          >
            <List className="w-4 h-4" />
          </button>
        </div>

        {/* Add button */}
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-mono hover:bg-primary/20 transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Memory
        </button>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 text-xs font-mono text-jarvis-text-muted mt-4">
        <span className="text-primary font-semibold">{memories.length}</span> memories
        {typeFilter !== "all" && <span>filtered by <span className="text-primary">{typeFilter}</span></span>}
      </div>

      {/* Memory grid/list */}
      <div className="flex-1 overflow-y-auto mt-4">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-36 rounded-xl bg-jarvis-surface animate-pulse" />
            ))}
          </div>
        ) : memories.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16">
            <Brain className="w-12 h-12 text-jarvis-text-muted/30" />
            <div className="text-center">
              <p className="text-jarvis-text-muted font-mono">No memories found</p>
              <p className="text-jarvis-text-muted/60 text-sm font-mono mt-1">
                {search ? "Try a different search term" : "Add your first memory"}
              </p>
            </div>
          </div>
        ) : (
          <motion.div
            layout
            className={cn(
              "gap-4",
              viewMode === "grid"
                ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                : "flex flex-col"
            )}
          >
            <AnimatePresence mode="popLayout">
              {memories.map((memory) => (
                <MemoryCard
                  key={memory.id}
                  memory={memory}
                  onDelete={(id) => deleteMutation.mutate(id)}
                  onEdit={() => {}}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* Create modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && setShowCreateModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="glass-strong border border-jarvis-border rounded-2xl p-6 w-full max-w-lg"
            >
              <h2 className="text-lg font-mono font-bold text-jarvis-text mb-4">New Memory</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-mono text-jarvis-text-muted uppercase tracking-wider block mb-1.5">Content</label>
                  <textarea
                    value={newMemory.content}
                    onChange={(e) => setNewMemory({ ...newMemory, content: e.target.value })}
                    className="jarvis-input w-full min-h-24 text-sm resize-none"
                    placeholder="What should I remember?"
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-mono text-jarvis-text-muted uppercase tracking-wider block mb-1.5">Type</label>
                    <select
                      value={newMemory.type}
                      onChange={(e) => setNewMemory({ ...newMemory, type: e.target.value as MemoryType })}
                      className="jarvis-input w-full text-sm"
                    >
                      {Object.keys(typeConfig).map((t) => (
                        <option key={t} value={t} className="bg-jarvis-surface">{typeConfig[t as MemoryType].label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-mono text-jarvis-text-muted uppercase tracking-wider block mb-1.5">Importance (1-5)</label>
                    <input
                      type="number"
                      min={1} max={5}
                      value={newMemory.importance}
                      onChange={(e) => setNewMemory({ ...newMemory, importance: Number(e.target.value) })}
                      className="jarvis-input w-full text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-mono text-jarvis-text-muted uppercase tracking-wider block mb-1.5">Tags (comma separated)</label>
                  <input
                    value={newMemory.tags}
                    onChange={(e) => setNewMemory({ ...newMemory, tags: e.target.value })}
                    className="jarvis-input w-full text-sm"
                    placeholder="work, personal, important"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 mt-6">
                <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 rounded-lg glass border border-jarvis-border text-sm font-mono text-jarvis-text-muted hover:text-primary transition-colors">Cancel</button>
                <button
                  onClick={handleCreate}
                  disabled={!newMemory.content || createMutation.isPending}
                  className="px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-mono hover:bg-primary/20 transition-all disabled:opacity-50"
                >
                  {createMutation.isPending ? "Saving..." : "Save Memory"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
