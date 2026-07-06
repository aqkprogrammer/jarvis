"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Github,
  GitPullRequest,
  Loader2,
  Plus,
  Sparkles,
  Star,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getApi } from "@/lib/api";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/components/ui/button";
import { extractResult } from "./shared";
import type { GithubPR, GithubRepo, Integration, PRSummary } from "@/types";

export function GithubWorkspace({ integration }: { integration: Integration }) {
  const { addNotification } = useUIStore();
  const [repoOverride, setRepoOverride] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<Record<number, PRSummary>>({});
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [issueTitle, setIssueTitle] = useState("");
  const [issueBody, setIssueBody] = useState("");
  const [createdIssue, setCreatedIssue] = useState<{ number: number; url: string } | null>(null);

  const { data: repos = [], isLoading: reposLoading } = useQuery({
    queryKey: ["github-repos", integration.id],
    queryFn: async () => {
      const response = await getApi().integrations.action(integration.id, "list_repos");
      return extractResult<GithubRepo[]>(response.data);
    },
  });

  const selectedRepo = repoOverride ?? repos[0]?.full_name ?? "";

  const { data: prs = [], isLoading: prsLoading } = useQuery({
    queryKey: ["github-prs", integration.id, selectedRepo],
    queryFn: async () => {
      const response = await getApi().integrations.action(integration.id, "list_prs", {
        repo: selectedRepo,
      });
      return extractResult<GithubPR[]>(response.data);
    },
    enabled: selectedRepo.length > 0,
  });

  const summarizeMutation = useMutation({
    mutationFn: async (prNumber: number) => {
      const response = await getApi().integrations.action(integration.id, "summarize_pr", {
        repo: selectedRepo,
        number: prNumber,
      });
      return extractResult<PRSummary>(response.data);
    },
    onSuccess: (summary, prNumber) => {
      setSummaries((s) => ({ ...s, [prNumber]: summary }));
      setExpanded((e) => ({ ...e, [prNumber]: true }));
    },
    onError: (error) => addNotification("error", "Summary Failed", (error as Error).message),
  });

  const createIssueMutation = useMutation({
    mutationFn: async () => {
      const response = await getApi().integrations.action(integration.id, "create_issue", {
        repo: selectedRepo,
        title: issueTitle.trim(),
        body: issueBody.trim(),
      });
      return extractResult<{ number: number; url: string }>(response.data);
    },
    onSuccess: (issue) => {
      setCreatedIssue(issue);
      setIssueTitle("");
      setIssueBody("");
      addNotification("success", "Issue Created", `#${issue.number} opened on ${selectedRepo}`);
    },
    onError: (error) => addNotification("error", "Issue Failed", (error as Error).message),
  });

  const handleRepoChange = (repo: string) => {
    setRepoOverride(repo);
    setSummaries({});
    setExpanded({});
    setCreatedIssue(null);
  };

  const handleSummaryClick = (prNumber: number) => {
    if (summaries[prNumber]) {
      setExpanded((e) => ({ ...e, [prNumber]: !e[prNumber] }));
    } else {
      summarizeMutation.mutate(prNumber);
    }
  };

  const currentRepo = repos.find((r) => r.full_name === selectedRepo);

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Github className="w-4 h-4 text-primary" />
        <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-jarvis-text-muted">
          GitHub Workspace
        </h2>
        <span className="text-[10px] font-mono text-jarvis-text-muted/60">— {integration.name}</span>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="jarvis-card p-5 space-y-5"
      >
        {/* Repo picker */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-64">
            <label className="text-xs font-mono text-jarvis-text-muted uppercase tracking-wider block mb-1.5">
              Repository
            </label>
            {reposLoading ? (
              <div className="h-10 rounded-lg bg-jarvis-surface animate-pulse" />
            ) : (
              <select
                value={selectedRepo}
                onChange={(e) => handleRepoChange(e.target.value)}
                className="jarvis-input w-full text-sm"
              >
                {repos.map((repo) => (
                  <option key={repo.full_name} value={repo.full_name} className="bg-jarvis-surface">
                    {repo.full_name}
                  </option>
                ))}
              </select>
            )}
          </div>
          {currentRepo && (
            <div className="pb-1 text-[11px] font-mono text-jarvis-text-muted flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Star className="w-3 h-3 text-amber-400" />
                {currentRepo.stars}
              </span>
              <span>
                updated {formatDistanceToNow(new Date(currentRepo.updated_at), { addSuffix: true })}
              </span>
            </div>
          )}
        </div>
        {currentRepo?.description && (
          <p className="text-xs font-mono text-jarvis-text-muted -mt-3">{currentRepo.description}</p>
        )}

        {/* Open PRs */}
        <div>
          <p className="text-xs font-mono text-jarvis-text-muted uppercase tracking-wider mb-2">
            Open Pull Requests
          </p>
          {prsLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-10 rounded-lg bg-jarvis-surface animate-pulse" />
              ))}
            </div>
          ) : prs.length === 0 ? (
            <p className="text-xs font-mono text-jarvis-text-muted/60 py-3">
              No open pull requests on {selectedRepo || "this repo"}.
            </p>
          ) : (
            <div className="divide-y divide-jarvis-border/60">
              {prs.map((pr) => {
                const summary = summaries[pr.number];
                const isOpen = Boolean(expanded[pr.number] && summary);
                const isSummarizing =
                  summarizeMutation.isPending && summarizeMutation.variables === pr.number;
                return (
                  <div key={pr.number}>
                    <div className="flex items-center gap-3 py-2.5">
                      <GitPullRequest className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="text-xs font-mono text-primary/80 shrink-0">#{pr.number}</span>
                      <span className="text-sm text-jarvis-text truncate flex-1">{pr.title}</span>
                      <span className="text-[10px] font-mono text-jarvis-text-muted shrink-0 hidden sm:inline">
                        {pr.user}
                      </span>
                      <span className="text-[10px] font-mono text-jarvis-text-muted shrink-0 hidden md:inline">
                        {formatDistanceToNow(new Date(pr.created_at), { addSuffix: true })}
                      </span>
                      <button
                        onClick={() => handleSummaryClick(pr.number)}
                        disabled={isSummarizing}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-mono transition-all shrink-0 disabled:opacity-60",
                          isOpen
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-jarvis-border glass text-jarvis-text-muted hover:text-primary hover:border-primary/30"
                        )}
                      >
                        {isSummarizing ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Sparkles className="w-3 h-3" />
                        )}
                        {isSummarizing ? "Summarizing..." : "AI Summary"}
                        {summary &&
                          !isSummarizing &&
                          (isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                      </button>
                    </div>
                    <AnimatePresence>
                      {isOpen && summary && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="border-l-2 border-primary/60 bg-primary/5 rounded-r-lg px-4 py-3 mb-3 ml-1">
                            <p className="text-[10px] font-mono uppercase tracking-wider text-primary/80 mb-2">
                              AI Summary — {summary.files_changed} files changed
                            </p>
                            <p className="text-xs font-mono text-jarvis-text/90 leading-relaxed whitespace-pre-line">
                              {summary.summary}
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Create issue */}
        <div className="border-t border-jarvis-border/60 pt-4">
          <p className="text-xs font-mono text-jarvis-text-muted uppercase tracking-wider mb-2">
            Create Issue on {selectedRepo || "..."}
          </p>
          <div className="space-y-2">
            <input
              value={issueTitle}
              onChange={(e) => setIssueTitle(e.target.value)}
              className="jarvis-input w-full text-sm"
              placeholder="Issue title"
            />
            <textarea
              value={issueBody}
              onChange={(e) => setIssueBody(e.target.value)}
              className="jarvis-input w-full text-sm min-h-20 resize-none"
              rows={3}
              placeholder="Describe the issue (markdown supported)"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={() => createIssueMutation.mutate()}
                disabled={
                  !selectedRepo || issueTitle.trim().length === 0 || createIssueMutation.isPending
                }
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-mono hover:bg-primary/20 transition-all disabled:opacity-50"
              >
                {createIssueMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                {createIssueMutation.isPending ? "Creating..." : "Create Issue"}
              </button>
              {createdIssue && (
                <a
                  href={createdIssue.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs font-mono text-emerald-400 hover:underline"
                >
                  <Check className="w-3.5 h-3.5" />
                  Issue #{createdIssue.number} created
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
