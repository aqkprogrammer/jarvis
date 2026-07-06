"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  UploadCloud, Search, FileText, FileSpreadsheet, FileCode,
  File as FileIcon, Trash2, Loader2, Layers, X
} from "lucide-react";
import { Header } from "@/components/dashboard/Header";
import { getApi } from "@/lib/api";
import { useUIStore } from "@/stores/uiStore";
import type { Document, DocumentSearchResult } from "@/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

const ACCEPTED_EXTENSIONS = [".pdf", ".txt", ".md", ".csv", ".docx"];
const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.join(",");

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function iconForFilename(filename: string) {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  if (ext === ".csv" || ext === ".xlsx") return FileSpreadsheet;
  if (ext === ".md" || ext === ".json") return FileCode;
  if (ext === ".pdf" || ext === ".txt" || ext === ".docx") return FileText;
  return FileIcon;
}

function StatusChip({ doc }: { doc: Document }) {
  if (doc.status === "processing") {
    return (
      <Badge variant="warning" dot className="animate-pulse">
        processing
      </Badge>
    );
  }
  if (doc.status === "ready") {
    return (
      <Badge variant="success" dot>
        ready
      </Badge>
    );
  }
  return (
    <span title={doc.error || "Ingestion failed"} className="cursor-help">
      <Badge variant="danger" dot>
        failed
      </Badge>
    </span>
  );
}

function DocumentCard({
  doc,
  onDelete,
  isDeleting,
}: {
  doc: Document;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const Icon = iconForFilename(doc.filename);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      layout
      className="jarvis-card p-4 group hover:border-primary/30 transition-all duration-200 hover:shadow-jarvis-sm"
    >
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/20 shrink-0">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-mono text-jarvis-text truncate" title={doc.filename}>
            {doc.filename}
          </p>
          <p className="text-xs font-mono text-jarvis-text-muted mt-0.5">
            {formatBytes(doc.size_bytes)} &middot; {doc.chunk_count} chunk{doc.chunk_count === 1 ? "" : "s"}
          </p>
        </div>
        <button
          onClick={() => {
            if (confirming) {
              onDelete(doc.id);
              setConfirming(false);
            } else {
              setConfirming(true);
            }
          }}
          onMouseLeave={() => setConfirming(false)}
          disabled={isDeleting}
          title={confirming ? "Click again to confirm" : "Delete document"}
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
      <div className="flex items-center justify-between mt-3">
        <StatusChip doc={doc} />
        <span className="text-[10px] font-mono text-jarvis-text-muted">
          {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}
        </span>
      </div>
    </motion.div>
  );
}

function SearchResultCard({ result }: { result: DocumentSearchResult }) {
  const pct = Math.round(Math.max(0, Math.min(1, result.score)) * 100);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="jarvis-card p-4"
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-primary/5 border border-primary/20 text-primary/80 min-w-0">
          <FileText className="w-2.5 h-2.5 shrink-0" />
          <span className="truncate">{result.filename}</span>
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-24 h-1 rounded-full bg-jarvis-border overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="h-full rounded-full bg-primary"
            />
          </div>
          <span className="text-[10px] font-mono text-primary/80 w-8 text-right">{pct}%</span>
        </div>
      </div>
      <p className="text-sm font-mono text-jarvis-text-muted leading-relaxed">{result.content}</p>
    </motion.div>
  );
}

export default function DocumentsPage() {
  const [dragOver, setDragOver] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<DocumentSearchResult[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();
  const { addNotification } = useUIStore();

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const response = await getApi().documents.list();
      const items = (response.data.items || response.data.data || response.data) as Document[];
      return Array.isArray(items) ? items : [];
    },
    // Keep polling while any document is still being ingested
    refetchInterval: (q) => {
      const docs = q.state.data as Document[] | undefined;
      return docs?.some((d) => d.status === "processing") ? 2000 : false;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => getApi().documents.upload(file),
    onMutate: (file) => {
      setUploadingFiles((prev) => [...prev, file.name]);
    },
    onSettled: (_data, _error, file) => {
      setUploadingFiles((prev) => prev.filter((name) => name !== file.name));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (error, file) => {
      addNotification("error", "Upload Failed", `${file.name}: ${(error as Error).message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => getApi().documents.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents"] }),
    onError: (error) => addNotification("error", "Delete Failed", (error as Error).message),
  });

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      Array.from(files).forEach((file) => {
        const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
        if (!ACCEPTED_EXTENSIONS.includes(ext)) {
          addNotification(
            "warning",
            "Unsupported File",
            `${file.name} — accepted types: ${ACCEPTED_EXTENSIONS.join(", ")}`
          );
          return;
        }
        uploadMutation.mutate(file);
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const response = await getApi().documents.search(q, undefined, 8);
      const results = (response.data.results || response.data.items || response.data) as DocumentSearchResult[];
      setSearchResults(Array.isArray(results) ? results : []);
    } catch (error) {
      setSearchResults([]);
      addNotification("error", "Search Failed", (error as Error).message);
    } finally {
      setSearching(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const totalChunks = documents.reduce((sum, d) => sum + d.chunk_count, 0);
  const processingCount = documents.filter((d) => d.status === "processing").length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Documents" subtitle="Knowledge base for retrieval-augmented answers" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Upload zone */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "jarvis-card border-dashed cursor-pointer p-8 flex flex-col items-center justify-center gap-3 transition-all duration-200",
            dragOver
              ? "border-primary/60 bg-primary/5 shadow-jarvis-md scale-[1.01]"
              : "hover:border-primary/30 hover:bg-primary/[0.02]"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_ATTR}
            multiple
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <div
            className={cn(
              "w-14 h-14 rounded-full bg-primary/5 border border-primary/20 flex items-center justify-center transition-all",
              dragOver && "animate-pulse-glow"
            )}
          >
            <UploadCloud className="w-6 h-6 text-primary" />
          </div>
          <div className="text-center">
            <p className="text-sm font-mono text-jarvis-text">
              {dragOver ? "Release to upload" : "Drop files here or click to browse"}
            </p>
            <p className="text-xs font-mono text-jarvis-text-muted mt-1 uppercase tracking-wider">
              {ACCEPTED_EXTENSIONS.join(" ")}
            </p>
          </div>
        </motion.div>

        {/* Semantic search */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-jarvis-text-muted pointer-events-none" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Search across your documents..."
                className="jarvis-input w-full pl-10 text-sm"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={searching || !query.trim()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-mono hover:bg-primary/20 transition-all disabled:opacity-50"
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
              Search
            </button>
            {searchResults !== null && (
              <button
                onClick={() => {
                  setSearchResults(null);
                  setQuery("");
                }}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg glass border border-jarvis-border text-xs font-mono text-jarvis-text-muted hover:text-primary transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
          </div>

          {/* Search results */}
          <AnimatePresence>
            {searchResults !== null && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <p className="text-xs font-mono text-jarvis-text-muted uppercase tracking-wider mb-3">
                  {searchResults.length} result{searchResults.length === 1 ? "" : "s"} for{" "}
                  <span className="text-primary">&quot;{query}&quot;</span>
                </p>
                {searchResults.length === 0 ? (
                  <p className="text-sm font-mono text-jarvis-text-muted py-4 text-center">
                    No matching passages found.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {searchResults.map((result, i) => (
                      <SearchResultCard key={`${result.document_id}-${i}`} result={result} />
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 text-xs font-mono text-jarvis-text-muted">
          <span>
            <span className="text-primary font-semibold">{documents.length}</span> documents
          </span>
          <span>
            <span className="text-primary font-semibold">{totalChunks}</span> chunks indexed
          </span>
          {processingCount > 0 && (
            <span className="flex items-center gap-1.5 text-amber-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              {processingCount} processing
            </span>
          )}
        </div>

        {/* Document grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 rounded-xl bg-jarvis-surface animate-pulse" />
            ))}
          </div>
        ) : documents.length === 0 && uploadingFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16">
            <FileText className="w-12 h-12 text-jarvis-text-muted/30" />
            <div className="text-center">
              <p className="text-jarvis-text-muted font-mono">No documents yet</p>
              <p className="text-jarvis-text-muted/60 text-sm font-mono mt-1">
                Upload files to build your knowledge base
              </p>
            </div>
          </div>
        ) : (
          <motion.div layout className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {uploadingFiles.map((name) => (
                <motion.div
                  key={`uploading-${name}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  className="jarvis-card p-4 border-primary/30"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/20 shrink-0">
                      <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono text-jarvis-text truncate">{name}</p>
                      <p className="text-xs font-mono text-primary/70 mt-0.5 animate-pulse uppercase tracking-wider">
                        Uploading...
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 h-1 rounded-full bg-jarvis-border overflow-hidden">
                    <div className="h-full w-1/2 rounded-full bg-primary/60 animate-data-stream bg-gradient-to-r from-primary/20 via-primary to-primary/20" />
                  </div>
                </motion.div>
              ))}
              {documents.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  onDelete={(id) => deleteMutation.mutate(id)}
                  isDeleting={deleteMutation.isPending && deleteMutation.variables === doc.id}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  );
}
