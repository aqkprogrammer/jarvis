"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Search, MessageSquare, Trash2, Pin, Archive,
  MoreHorizontal, Star
} from "lucide-react";
import { ConversationSummary } from "@/types";
import { cn } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

interface ConversationListProps {
  conversations: ConversationSummary[];
  currentId?: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onArchive?: (id: string) => void;
  onPin?: (id: string) => void;
}

export function ConversationList({
  conversations,
  currentId,
  onSelect,
  onNew,
  onDelete,
  onArchive,
  onPin,
}: ConversationListProps) {
  const [search, setSearch] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    c.last_message?.toLowerCase().includes(search.toLowerCase())
  );

  const pinned = filtered.filter((c) => c.pinned);
  const regular = filtered.filter((c) => !c.pinned && !c.archived);

  return (
    <div className="flex flex-col h-full bg-jarvis-surface border-r border-jarvis-border w-72 shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-jarvis-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-mono font-semibold text-jarvis-text-muted uppercase tracking-wider">
            Conversations
          </h2>
          <button
            onClick={onNew}
            className="p-1.5 rounded-lg text-jarvis-text-muted hover:text-primary hover:bg-primary/10 border border-transparent hover:border-primary/20 transition-all"
            title="New conversation"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-jarvis-text-muted pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations..."
            className="jarvis-input w-full text-xs pl-9 py-2"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-2">
        {/* Pinned */}
        {pinned.length > 0 && (
          <div className="mb-2">
            <div className="flex items-center gap-1.5 px-4 py-1.5">
              <Pin className="w-3 h-3 text-primary/60" />
              <span className="text-xs font-mono text-jarvis-text-muted uppercase tracking-wider">Pinned</span>
            </div>
            {pinned.map((conv) => (
              <ConvItem
                key={conv.id}
                conv={conv}
                isActive={conv.id === currentId}
                menuOpen={menuOpenId === conv.id}
                onSelect={onSelect}
                onMenuToggle={(id) => setMenuOpenId(menuOpenId === id ? null : id)}
                onDelete={onDelete}
                onArchive={onArchive}
                onPin={onPin}
              />
            ))}
          </div>
        )}

        {/* Regular */}
        {regular.length > 0 ? (
          <div>
            {pinned.length > 0 && (
              <div className="px-4 py-1.5">
                <span className="text-xs font-mono text-jarvis-text-muted uppercase tracking-wider">Recent</span>
              </div>
            )}
            {regular.map((conv) => (
              <ConvItem
                key={conv.id}
                conv={conv}
                isActive={conv.id === currentId}
                menuOpen={menuOpenId === conv.id}
                onSelect={onSelect}
                onMenuToggle={(id) => setMenuOpenId(menuOpenId === id ? null : id)}
                onDelete={onDelete}
                onArchive={onArchive}
                onPin={onPin}
              />
            ))}
          </div>
        ) : !pinned.length ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center px-4">
            <MessageSquare className="w-8 h-8 text-jarvis-text-muted/40" />
            <div>
              <p className="text-sm font-mono text-jarvis-text-muted">No conversations yet</p>
              <p className="text-xs font-mono text-jarvis-text-muted/60 mt-1">Start a new chat to begin</p>
            </div>
            <button
              onClick={onNew}
              className="px-4 py-2 rounded-lg text-xs font-mono text-primary border border-primary/30 hover:bg-primary/10 transition-colors"
            >
              New Conversation
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface ConvItemProps {
  conv: ConversationSummary;
  isActive: boolean;
  menuOpen: boolean;
  onSelect: (id: string) => void;
  onMenuToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onArchive?: (id: string) => void;
  onPin?: (id: string) => void;
}

function ConvItem({ conv, isActive, menuOpen, onSelect, onMenuToggle, onDelete, onArchive, onPin }: ConvItemProps) {
  return (
    <div className="relative group">
      <button
        onClick={() => onSelect(conv.id)}
        className={cn(
          "w-full text-left px-4 py-3 transition-all hover:bg-primary/5",
          isActive && "bg-primary/10 border-r-2 border-r-primary"
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <p className={cn(
            "text-sm font-mono truncate flex-1",
            isActive ? "text-primary font-semibold" : "text-jarvis-text"
          )}>
            {conv.title}
          </p>
          <span className="text-xs font-mono text-jarvis-text-muted shrink-0 mt-0.5">
            {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: false })}
          </span>
        </div>
        {conv.last_message && (
          <p className="text-xs text-jarvis-text-muted mt-1 truncate pr-2">
            {conv.last_message}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-xs font-mono text-jarvis-text-muted/60">{conv.message_count} msgs</span>
          {conv.model && (
            <span className="text-xs font-mono text-primary/50">
              {conv.model.split("-").slice(-2).join("-")}
            </span>
          )}
        </div>
      </button>

      {/* Actions */}
      <div className={cn(
        "absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1",
        "opacity-0 group-hover:opacity-100 transition-opacity",
        menuOpen && "opacity-100"
      )}>
        <button
          onClick={(e) => { e.stopPropagation(); onMenuToggle(conv.id); }}
          className="p-1.5 rounded-lg hover:bg-primary/10 text-jarvis-text-muted hover:text-primary transition-colors"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Context menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute right-2 top-full mt-1 z-50 glass-strong border border-jarvis-border rounded-xl shadow-jarvis-md p-1 min-w-40"
          >
            {onPin && (
              <button
                onClick={() => { onPin(conv.id); onMenuToggle(conv.id); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono text-jarvis-text-muted hover:text-primary hover:bg-primary/5 transition-colors"
              >
                <Pin className="w-3.5 h-3.5" />
                {conv.pinned ? "Unpin" : "Pin"}
              </button>
            )}
            {onArchive && (
              <button
                onClick={() => { onArchive(conv.id); onMenuToggle(conv.id); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono text-jarvis-text-muted hover:text-primary hover:bg-primary/5 transition-colors"
              >
                <Archive className="w-3.5 h-3.5" />
                Archive
              </button>
            )}
            <button
              onClick={() => { onDelete(conv.id); onMenuToggle(conv.id); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono text-red-400 hover:bg-red-500/5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
