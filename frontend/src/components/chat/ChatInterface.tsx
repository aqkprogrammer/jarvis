"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, Paperclip, Mic, MicOff, ChevronDown, Sparkles,
  Square, Loader2, FileText, X, Check
} from "lucide-react";
import { useChat } from "@/hooks/useChat";
import { useChatStore } from "@/stores/chatStore";
import { MessageBubble } from "./MessageBubble";
import { ConversationList } from "./ConversationList";
import { ArtifactPanel } from "./ArtifactPanel";
import { Header } from "@/components/dashboard/Header";
import { cn } from "@/components/ui/button";
import { getApi } from "@/lib/api";
import type { Document } from "@/types";

const MODELS = [
  { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet", desc: "Best balance" },
  { id: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku", desc: "Fastest" },
  { id: "claude-opus-4-5", label: "Claude Opus 4", desc: "Most capable" },
];

export function ChatInterface() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const conversationId = searchParams?.get("id") ?? undefined;

  const [input, setInput] = useState("");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [availableDocs, setAvailableDocs] = useState<Document[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [attachedDocs, setAttachedDocs] = useState<Document[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const stopStreaming = useChatStore((s) => s.stopStreaming);

  const {
    messages,
    conversations,
    currentConversation,
    streaming,
    isLoadingMessages,
    isSending,
    selectedModel,
    handleSendMessage,
    handleNewConversation,
    loadConversation,
    deleteConversation,
    deleteMessage,
    setSelectedModel,
  } = useChat(conversationId);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming.content]);

  // Scroll button visibility
  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    setShowScrollButton(!isNearBottom);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [input]);

  // Load ready documents for the attach popover
  const toggleDocPicker = useCallback(async () => {
    const opening = !showDocPicker;
    setShowDocPicker(opening);
    if (!opening) return;
    setDocsLoading(true);
    try {
      const response = await getApi().documents.list();
      const items = (response.data.items || response.data.data || response.data) as Document[];
      setAvailableDocs(Array.isArray(items) ? items.filter((d) => d.status === "ready") : []);
    } catch {
      setAvailableDocs([]);
    } finally {
      setDocsLoading(false);
    }
  }, [showDocPicker]);

  const toggleAttachDoc = useCallback((doc: Document) => {
    setAttachedDocs((prev) =>
      prev.some((d) => d.id === doc.id)
        ? prev.filter((d) => d.id !== doc.id)
        : [...prev, doc]
    );
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isSending || streaming.isStreaming) return;
    const text = input.trim();
    const documents = attachedDocs.map((d) => ({ id: d.id, filename: d.filename }));
    setInput("");
    setAttachedDocs([]);
    setShowDocPicker(false);
    await handleSendMessage(text, documents.length > 0 ? documents : undefined);
  }, [input, isSending, streaming.isStreaming, handleSendMessage, attachedDocs]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSelectConversation = (id: string) => {
    router.push(`/chat?id=${id}`);
    loadConversation(id);
  };

  const handleNewChat = async () => {
    const conv = await handleNewConversation();
    if (conv) {
      router.push(`/chat?id=${conv.id}`);
    }
  };

  const selectedModelInfo = MODELS.find((m) => m.id === selectedModel) || MODELS[0];

  return (
    <div className="flex h-full overflow-hidden">
      {/* Conversation sidebar */}
      <ConversationList
        conversations={conversations}
        currentId={currentConversation?.id}
        onSelect={handleSelectConversation}
        onNew={handleNewChat}
        onDelete={deleteConversation}
        onPin={(id) => {/* TODO */}}
        onArchive={(id) => {/* TODO */}}
      />

      {/* Main chat area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          title={currentConversation?.title || "New Chat"}
          subtitle={currentConversation ? `${messages.length} messages` : "Start a conversation"}
        />

        {/* Messages */}
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-6 py-6 space-y-6"
        >
          {isLoadingMessages ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-6 py-12">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-20 h-20 rounded-full bg-primary/5 border border-primary/20 flex items-center justify-center animate-pulse-glow"
              >
                <Sparkles className="w-8 h-8 text-primary" />
              </motion.div>
              <div className="text-center">
                <h2 className="text-xl font-bold font-mono text-jarvis-text mb-2">
                  How can I help you today?
                </h2>
                <p className="text-jarvis-text-muted text-sm font-mono">
                  Ask me anything. I&apos;m here to assist.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 max-w-md w-full">
                {[
                  "Explain quantum computing",
                  "Write a Python script",
                  "Help me brainstorm ideas",
                  "Analyze this data",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                    className="px-4 py-2.5 rounded-xl glass border border-jarvis-border text-xs font-mono text-jarvis-text-muted hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-all text-left"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  onDelete={deleteMessage}
                  isStreaming={streaming.isStreaming && streaming.messageId === message.id}
                />
              ))}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Scroll to bottom button */}
        <AnimatePresence>
          {showScrollButton && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={scrollToBottom}
              className="absolute bottom-24 right-8 p-2.5 rounded-full glass border border-jarvis-border text-jarvis-text-muted hover:text-primary shadow-jarvis-sm"
            >
              <ChevronDown className="w-4 h-4" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Input area */}
        <div className="px-6 py-4 border-t border-jarvis-border bg-jarvis-surface/50 backdrop-blur-sm">
          {/* Model selector */}
          <div className="flex items-center justify-between mb-3">
            <div className="relative">
              <button
                onClick={() => setShowModelPicker(!showModelPicker)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg glass border border-jarvis-border hover:border-primary/30 text-xs font-mono text-jarvis-text-muted hover:text-primary transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{selectedModelInfo.label}</span>
                <ChevronDown className={cn("w-3 h-3 transition-transform", showModelPicker && "rotate-180")} />
              </button>

              <AnimatePresence>
                {showModelPicker && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className="absolute bottom-full mb-2 left-0 glass-strong border border-jarvis-border rounded-xl shadow-jarvis-md z-50 min-w-56 p-1"
                  >
                    {MODELS.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => { setSelectedModel(model.id); setShowModelPicker(false); }}
                        className={cn(
                          "w-full text-left px-3 py-2.5 rounded-lg text-xs font-mono transition-colors",
                          selectedModel === model.id
                            ? "bg-primary/10 text-primary"
                            : "text-jarvis-text-muted hover:text-primary hover:bg-primary/5"
                        )}
                      >
                        <div className="font-semibold">{model.label}</div>
                        <div className="opacity-60 mt-0.5">{model.desc}</div>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {streaming.isStreaming && (
              <button
                onClick={stopStreaming}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-red-400 border border-red-400/20 hover:bg-red-500/5 transition-colors"
              >
                <Square className="w-3 h-3 fill-current" />
                Stop
              </button>
            )}
          </div>

          {/* Attached document chips */}
          <AnimatePresence>
            {attachedDocs.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex flex-wrap gap-1.5 mb-2 overflow-hidden"
              >
                {attachedDocs.map((doc) => (
                  <span
                    key={doc.id}
                    className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-full text-xs font-mono bg-primary/10 border border-primary/25 text-primary"
                  >
                    <FileText className="w-3 h-3 shrink-0" />
                    <span className="max-w-40 truncate">{doc.filename}</span>
                    <button
                      onClick={() => toggleAttachDoc(doc)}
                      className="p-0.5 rounded-full hover:bg-primary/20 transition-colors"
                      title="Remove attachment"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input box */}
          <div className="relative flex items-end gap-3">
            <div className="flex-1 relative">
              {/* Document picker popover */}
              <AnimatePresence>
                {showDocPicker && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className="absolute bottom-full right-0 mb-2 w-80 glass-strong border border-jarvis-border rounded-xl shadow-jarvis-md z-50 overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-3 py-2 border-b border-jarvis-border">
                      <span className="text-[10px] font-mono font-semibold text-jarvis-text-muted uppercase tracking-wider">
                        Attach Documents
                      </span>
                      <button
                        onClick={() => setShowDocPicker(false)}
                        className="p-1 rounded text-jarvis-text-muted hover:text-primary transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="max-h-56 overflow-y-auto p-1">
                      {docsLoading ? (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        </div>
                      ) : availableDocs.length === 0 ? (
                        <p className="px-3 py-4 text-xs font-mono text-jarvis-text-muted text-center">
                          No ready documents. Upload files on the Documents page.
                        </p>
                      ) : (
                        availableDocs.map((doc) => {
                          const selected = attachedDocs.some((d) => d.id === doc.id);
                          return (
                            <button
                              key={doc.id}
                              onClick={() => toggleAttachDoc(doc)}
                              className={cn(
                                "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors",
                                selected
                                  ? "bg-primary/10 text-primary"
                                  : "text-jarvis-text-muted hover:text-primary hover:bg-primary/5"
                              )}
                            >
                              <span
                                className={cn(
                                  "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                                  selected ? "border-primary bg-primary/20" : "border-jarvis-border"
                                )}
                              >
                                {selected && <Check className="w-3 h-3" />}
                              </span>
                              <FileText className="w-3.5 h-3.5 shrink-0" />
                              <span className="flex-1 min-w-0">
                                <span className="block text-xs font-mono truncate">{doc.filename}</span>
                                <span className="block text-[10px] font-mono opacity-60">
                                  {doc.chunk_count} chunks
                                </span>
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message JARVIS... (Enter to send, Shift+Enter for newline)"
                rows={1}
                className="jarvis-input w-full resize-none pr-20 py-3 text-sm leading-relaxed min-h-[48px] max-h-[200px]"
                style={{ overflow: "hidden" }}
              />
              <div className="absolute right-3 bottom-3 flex items-center gap-1.5">
                <button
                  onClick={toggleDocPicker}
                  title="Attach documents"
                  className={cn(
                    "relative p-1 rounded transition-colors",
                    showDocPicker || attachedDocs.length > 0
                      ? "text-primary"
                      : "text-jarvis-text-muted hover:text-primary"
                  )}
                >
                  <Paperclip className="w-4 h-4" />
                  {attachedDocs.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-primary text-jarvis-bg text-[9px] font-bold font-mono flex items-center justify-center">
                      {attachedDocs.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setVoiceActive(!voiceActive)}
                  className={cn(
                    "p-1 rounded transition-colors",
                    voiceActive ? "text-primary" : "text-jarvis-text-muted hover:text-primary"
                  )}
                >
                  {voiceActive ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={!input.trim() || isSending || streaming.isStreaming}
              className={cn(
                "flex-shrink-0 p-3 rounded-xl border font-mono transition-all duration-200",
                input.trim() && !isSending && !streaming.isStreaming
                  ? "bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 hover:shadow-jarvis-sm"
                  : "bg-jarvis-surface border-jarvis-border text-jarvis-text-muted opacity-50 cursor-not-allowed"
              )}
            >
              {isSending || streaming.isStreaming ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>

          <p className="text-center text-xs font-mono text-jarvis-text-muted/40 mt-2">
            JARVIS can make mistakes. Verify important information.
          </p>
        </div>
      </div>

      {/* Right-side artifact panel */}
      <ArtifactPanel />
    </div>
  );
}
