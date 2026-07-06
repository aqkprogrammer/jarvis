/**
 * Mock API — mirrors the real api.ts interface exactly.
 * Used when the backend is unreachable (demo mode).
 */
import {
  DEMO_USER,
  DEMO_TOKEN,
  DEMO_EMAIL,
  DEMO_PASSWORD,
  DEMO_CONVERSATIONS,
  DEMO_MESSAGES,
  DEMO_MEMORIES,
  DEMO_TASKS,
  DEMO_AGENTS,
  DEMO_ANALYTICS,
  DEMO_DOCUMENTS,
  DEMO_DOCUMENT_CHUNKS,
  DEMO_WORKFLOWS,
  DEMO_WORKFLOW_RUNS,
  DEMO_SCHEDULES,
  DEMO_API_KEYS,
  DEMO_INTEGRATIONS,
  DEMO_GITHUB_REPOS,
  DEMO_GITHUB_PRS,
  DEMO_WEBHOOK_TRIGGERS,
  DEMO_OUTGOING_WEBHOOKS,
  DEMO_WORKSPACE,
  DEMO_WORKSPACE_MEMBERS,
  DEMO_WORKSPACE_INVITES,
  DEMO_SHARED_CONVERSATIONS,
  DEMO_VAPID_PUBLIC_KEY,
  buildDemoPRSummary,
  getRandomDemoResponse,
} from "./mockData";
import type {
  Message, Memory, Task, Agent, Document, DocumentSearchResult, ReasoningStep,
  Workflow, WorkflowEdge, WorkflowNode, WorkflowRun, NodeResult,
  Schedule, ScheduleTargetType, ApiKey, ApiKeyCreated,
  Integration, IntegrationProvider, WebhookTrigger, OutgoingWebhook, WebhookEvent,
  Workspace, WorkspaceMember, WorkspaceInvite, WorkspaceRole,
  SharedConversation, PushSubscriptionPayload,
} from "@/types";

// Simulates realistic network latency
const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms));

// Mutable state so in-session CRUD actually works
let conversations = [...DEMO_CONVERSATIONS];
let messagesStore: Record<string, Message[]> = JSON.parse(JSON.stringify(DEMO_MESSAGES));
let memoriesStore: Memory[] = [...DEMO_MEMORIES];
let tasksStore: Task[] = [...DEMO_TASKS];
const agentsStore: Agent[] = [...DEMO_AGENTS];
let documentsStore: Document[] = JSON.parse(JSON.stringify(DEMO_DOCUMENTS));
// Uploaded-in-session chunks so search also "finds" new files
let documentChunks = [...DEMO_DOCUMENT_CHUNKS];
let workflowsStore: Workflow[] = JSON.parse(JSON.stringify(DEMO_WORKFLOWS));
let workflowRunsStore: WorkflowRun[] = JSON.parse(JSON.stringify(DEMO_WORKFLOW_RUNS));
let schedulesStore: Schedule[] = JSON.parse(JSON.stringify(DEMO_SCHEDULES));
let apiKeysStore: ApiKey[] = JSON.parse(JSON.stringify(DEMO_API_KEYS));
let integrationsStore: Integration[] = JSON.parse(JSON.stringify(DEMO_INTEGRATIONS));
let webhookTriggersStore: WebhookTrigger[] = JSON.parse(JSON.stringify(DEMO_WEBHOOK_TRIGGERS));
let outgoingWebhooksStore: OutgoingWebhook[] = JSON.parse(JSON.stringify(DEMO_OUTGOING_WEBHOOKS));
let workspacesStore: Workspace[] = JSON.parse(JSON.stringify([DEMO_WORKSPACE]));
const workspaceMembersStore: Record<string, WorkspaceMember[]> = JSON.parse(JSON.stringify(DEMO_WORKSPACE_MEMBERS));
const workspaceInvitesStore: Record<string, WorkspaceInvite[]> = JSON.parse(JSON.stringify(DEMO_WORKSPACE_INVITES));
const sharedConversationsStore: Record<string, SharedConversation[]> = JSON.parse(JSON.stringify(DEMO_SHARED_CONVERSATIONS));
let pushSubscriptionsStore: PushSubscriptionPayload[] = [];

// Walks the workflow graph in edge order and fabricates per-node results.
function simulateWorkflowRun(workflow: Workflow, input: string): WorkflowRun {
  const startedAt = new Date().toISOString();
  const nodesById = new Map(workflow.nodes.map((n) => [n.id, n]));
  const adjacency = new Map<string, string[]>();
  workflow.edges.forEach((e) => {
    adjacency.set(e.source, [...(adjacency.get(e.source) ?? []), e.target]);
  });
  const hasIncoming = new Set(workflow.edges.map((e) => e.target));
  const roots = workflow.nodes.filter((n) => !hasIncoming.has(n.id));

  const results: Record<string, NodeResult> = {};
  const visited = new Set<string>();
  const queue: Array<{ id: string; carried: string; skipped: boolean }> = roots.map((n) => ({
    id: n.id,
    carried: input,
    skipped: false,
  }));

  while (queue.length > 0) {
    const { id, carried, skipped } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = nodesById.get(id);
    if (!node) continue;

    let output = carried;
    let skipDownstream = skipped;

    if (skipped) {
      results[id] = { status: "skipped" };
    } else {
      switch (node.type) {
        case "trigger":
          output = input || "Workflow triggered manually.";
          results[id] = { status: "completed", output, duration_ms: 5 + Math.floor(Math.random() * 20) };
          break;
        case "agent": {
          const agentType = node.data.agent_type || "planner";
          const task = node.data.prompt ? node.data.prompt.replace(/\{input\}/g, carried) : carried;
          output = `[${agentType} agent] Processed: ${task.slice(0, 160)}${task.length > 160 ? "…" : ""} — produced a structured result with 3 key findings and a recommended next step.`;
          results[id] = {
            status: "completed",
            output,
            duration_ms: 400 + Math.floor(Math.random() * 1600),
          };
          break;
        }
        case "condition": {
          const cond = node.data.condition;
          let pass = true;
          if (cond) {
            const haystack = carried.toLowerCase();
            const needle = cond.value.toLowerCase();
            if (cond.op === "contains") pass = haystack.includes(needle);
            else if (cond.op === "not_contains") pass = !haystack.includes(needle);
            else pass = haystack === needle;
          }
          output = carried;
          skipDownstream = !pass;
          results[id] = {
            status: "completed",
            output: cond
              ? `${pass} — output ${cond.op.replace("_", " ")} "${cond.value}"`
              : "true — no condition configured",
            duration_ms: 3 + Math.floor(Math.random() * 15),
          };
          break;
        }
        case "output":
          output = carried;
          results[id] = {
            status: "completed",
            output: `Final output delivered: ${carried.slice(0, 220)}${carried.length > 220 ? "…" : ""}`,
            duration_ms: 30 + Math.floor(Math.random() * 120),
          };
          break;
      }
    }

    (adjacency.get(id) ?? []).forEach((target) => {
      queue.push({ id: target, carried: output, skipped: skipDownstream });
    });
  }

  // Disconnected nodes never execute
  workflow.nodes.forEach((n) => {
    if (!results[n.id]) results[n.id] = { status: "skipped" };
  });

  return {
    id: `run-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    workflow_id: workflow.id,
    status: "completed",
    node_results: results,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
  };
}

// Naive "next run" estimate for the mock scheduler
function naiveNextRun(cron: string): string {
  const minuteField = cron.trim().split(/\s+/)[0] ?? "*";
  const stepMatch = minuteField.match(/^\*\/(\d+)$/);
  let deltaMs = 60 * 60 * 1000; // default: an hour from now
  if (minuteField === "*" ) deltaMs = 60 * 1000;
  else if (stepMatch) deltaMs = parseInt(stepMatch[1], 10) * 60 * 1000;
  else if (cron.trim().split(/\s+/)[1] !== "*") deltaMs = 24 * 60 * 60 * 1000; // daily-ish
  return new Date(Date.now() + deltaMs).toISOString();
}

// Builds a plausible reasoning trace for a simulated assistant reply
function buildDemoTrace(content: string, documentIds?: string[]): ReasoningStep[] {
  const steps: ReasoningStep[] = [
    {
      type: "thinking",
      label: "Analyzing request",
      detail: `Parsed a ${content.trim().split(/\s+/).length}-word prompt and planned the response strategy.`,
    },
  ];
  (documentIds || []).forEach((docId) => {
    const doc = documentsStore.find((d) => d.id === docId);
    if (doc) {
      steps.push({
        type: "retrieval",
        label: `Retrieved ${Math.min(doc.chunk_count, 2 + Math.floor(Math.random() * 3)) || 1} chunks from ${doc.filename}`,
        detail: `Vector search over ${doc.chunk_count} indexed chunks — top score 0.${87 + Math.floor(Math.random() * 10)}.`,
      });
    }
  });
  steps.push({
    type: "thinking",
    label: "Composing answer",
    detail: "Synthesized the final response from working context and retrieved passages.",
  });
  return steps;
}

function ok(data: unknown) {
  return { data, status: 200, statusText: "OK", headers: {}, config: {} as never };
}

export const mockApi = {
  auth: {
    login: async (email: string, password: string) => {
      await delay(600);
      if (email === DEMO_EMAIL && password === DEMO_PASSWORD) {
        return ok({ user: DEMO_USER, access_token: DEMO_TOKEN });
      }
      throw Object.assign(new Error("Invalid demo credentials. Use demo@jarvis.ai / jarvis2025"), { status: 401 });
    },
    logout: async () => { await delay(200); return ok({ message: "Logged out" }); },
    me: async () => { await delay(200); return ok(DEMO_USER); },
    refresh: async () => { await delay(200); return ok({ access_token: DEMO_TOKEN }); },
  },

  conversations: {
    list: async () => {
      await delay(300);
      return ok({ items: conversations, total: conversations.length, page: 1, per_page: 20 });
    },
    get: async (id: string) => {
      await delay(200);
      const conv = conversations.find((c) => c.id === id);
      if (!conv) throw Object.assign(new Error("Conversation not found"), { status: 404 });
      return ok({ ...conv, messages: messagesStore[id] || [] });
    },
    create: async (data: { title?: string }) => {
      await delay(400);
      const newConv = {
        id: `conv-${Date.now()}`,
        title: data.title || "New Conversation",
        last_message: "",
        last_message_at: new Date().toISOString(),
        message_count: 0,
        token_count: 0,
        model: "claude-sonnet-4-6",
        created_at: new Date().toISOString(),
        archived: false,
        pinned: false,
        tags: [] as string[],
      };
      conversations = [newConv, ...conversations];
      messagesStore[newConv.id] = [];
      return ok(newConv);
    },
    update: async (id: string, data: Partial<{ title: string; archived: boolean }>) => {
      await delay(200);
      conversations = conversations.map((c) => c.id === id ? { ...c, ...data } : c);
      return ok(conversations.find((c) => c.id === id));
    },
    delete: async (id: string) => {
      await delay(200);
      conversations = conversations.filter((c) => c.id !== id);
      delete messagesStore[id];
      return ok({ message: "Deleted" });
    },
    messages: async (id: string) => {
      await delay(300);
      return ok({ items: messagesStore[id] || [], total: (messagesStore[id] || []).length });
    },
  },

  messages: {
    send: async (conversationId: string, content: string, _model?: string, documentIds?: string[]) => {
      await delay(200);
      const attachedDocs = (documentIds || [])
        .map((id) => documentsStore.find((d) => d.id === id))
        .filter((d): d is Document => Boolean(d))
        .map((d) => ({ id: d.id, filename: d.filename }));
      const userMsg: Message = {
        id: `msg-${Date.now()}-u`,
        conversation_id: conversationId,
        role: "user",
        content,
        status: "complete",
        created_at: new Date().toISOString(),
        document_ids: documentIds,
        attached_documents: attachedDocs.length > 0 ? attachedDocs : undefined,
      };
      if (!messagesStore[conversationId]) messagesStore[conversationId] = [];
      messagesStore[conversationId].push(userMsg);

      // Simulate assistant response after delay
      setTimeout(async () => {
        await delay(800);
        const assistantMsg: Message = {
          id: `msg-${Date.now()}-a`,
          conversation_id: conversationId,
          role: "assistant",
          content: getRandomDemoResponse(),
          status: "complete",
          created_at: new Date().toISOString(),
          meta: {
            steps: buildDemoTrace(content, documentIds),
            model: "claude-sonnet-4-6",
            provider: "anthropic",
          },
        };
        messagesStore[conversationId].push(assistantMsg);
        conversations = conversations.map((c) =>
          c.id === conversationId
            ? { ...c, last_message: assistantMsg.content as string, last_message_at: assistantMsg.created_at, message_count: c.message_count + 2 }
            : c
        );
      }, 0);

      return ok({ user_message_id: userMsg.id, conversation_id: conversationId });
    },
    delete: async (conversationId: string, messageId: string) => {
      await delay(200);
      if (messagesStore[conversationId]) {
        messagesStore[conversationId] = messagesStore[conversationId].filter((m: Message) => m.id !== messageId);
      }
      return ok({ message: "Deleted" });
    },
  },

  documents: {
    upload: async (file: File) => {
      await delay(500);
      const now = new Date().toISOString();
      const doc: Document = {
        id: `doc-${Date.now()}`,
        user_id: DEMO_USER.id,
        filename: file.name,
        content_type: file.type || "application/octet-stream",
        size_bytes: file.size,
        status: "processing",
        chunk_count: 0,
        created_at: now,
        updated_at: now,
      };
      documentsStore = [doc, ...documentsStore];

      // Fake ingestion: flip "processing" -> "ready" after 1.5s
      setTimeout(() => {
        documentsStore = documentsStore.map((d) =>
          d.id === doc.id
            ? {
                ...d,
                status: "ready" as const,
                chunk_count: Math.max(1, Math.round(d.size_bytes / 24_000)),
                updated_at: new Date().toISOString(),
              }
            : d
        );
        documentChunks = [
          ...documentChunks,
          {
            document_id: doc.id,
            filename: doc.filename,
            content: `Demo-indexed content extracted from ${doc.filename}. Start the backend to ingest and search real document text.`,
          },
        ];
      }, 1500);

      return ok(doc);
    },
    list: async () => {
      await delay(300);
      return ok({ items: documentsStore, total: documentsStore.length });
    },
    get: async (id: string) => {
      await delay(200);
      const doc = documentsStore.find((d) => d.id === id);
      if (!doc) throw Object.assign(new Error("Document not found"), { status: 404 });
      return ok(doc);
    },
    delete: async (id: string) => {
      await delay(200);
      documentsStore = documentsStore.filter((d) => d.id !== id);
      documentChunks = documentChunks.filter((c) => c.document_id !== id);
      return ok({ message: "Deleted" });
    },
    search: async (query: string, documentIds?: string[], limit = 8) => {
      await delay(500);
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      const readyIds = new Set(
        documentsStore.filter((d) => d.status === "ready").map((d) => d.id)
      );
      const results: DocumentSearchResult[] = documentChunks
        .filter((c) => readyIds.has(c.document_id))
        .filter((c) => !documentIds || documentIds.length === 0 || documentIds.includes(c.document_id))
        .map((c) => {
          const text = c.content.toLowerCase();
          const hits = terms.filter((t) => text.includes(t)).length;
          return {
            content: c.content,
            document_id: c.document_id,
            filename: c.filename,
            score: terms.length > 0 ? Math.min(0.99, 0.45 + (hits / terms.length) * 0.5) : 0.5,
          };
        })
        .filter((r) => terms.length === 0 || r.score > 0.45)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
      return ok({ results, query, total: results.length });
    },
  },

  execute: {
    run: async (language: string, code: string) => {
      await delay(800);
      const lines = code.split("\n").length;
      return ok({
        stdout: `Demo mode: code execution simulated. Start the backend to run real code.\n[${language}] received ${lines} line${lines === 1 ? "" : "s"} — syntax OK.`,
        stderr: "",
        exit_code: 0,
        duration_ms: 400 + Math.floor(Math.random() * 500),
        truncated: false,
      });
    },
  },

  memory: {
    list: async (params?: { type?: string; search?: string }) => {
      await delay(300);
      let items = [...memoriesStore];
      if (params?.type) items = items.filter((m) => m.type === params.type);
      if (params?.search) {
        const q = params.search.toLowerCase();
        items = items.filter((m) => m.content.toLowerCase().includes(q) || (m.summary ?? "").toLowerCase().includes(q));
      }
      return ok({ items, total: items.length });
    },
    get: async (id: string) => {
      await delay(200);
      const mem = memoriesStore.find((m) => m.id === id);
      if (!mem) throw Object.assign(new Error("Memory not found"), { status: 404 });
      return ok(mem);
    },
    create: async (data: { content: string; type: string; importance: number; tags?: string[] }) => {
      await delay(400);
      const mem: Memory = {
        id: `mem-${Date.now()}`,
        user_id: DEMO_USER.id,
        type: data.type as Memory["type"],
        content: data.content,
        summary: data.content.slice(0, 80),
        importance: Math.max(1, Math.min(5, data.importance)) as Memory["importance"],
        tags: data.tags || [],
        access_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_accessed: new Date().toISOString(),
      };
      memoriesStore = [mem, ...memoriesStore];
      return ok(mem);
    },
    update: async (id: string, data: Partial<Memory>) => {
      await delay(200);
      memoriesStore = memoriesStore.map((m) => m.id === id ? { ...m, ...data } : m);
      return ok(memoriesStore.find((m) => m.id === id));
    },
    delete: async (id: string) => {
      await delay(200);
      memoriesStore = memoriesStore.filter((m) => m.id !== id);
      return ok({ message: "Deleted" });
    },
    search: async (query: string, limit = 5) => {
      await delay(400);
      const q = query.toLowerCase();
      const results = memoriesStore
        .filter((m) => m.content.toLowerCase().includes(q) || m.tags.some((t) => t.includes(q)))
        .slice(0, limit);
      return ok({ items: results, query });
    },
  },

  tasks: {
    list: async (params?: { status?: string }) => {
      await delay(300);
      let items = [...tasksStore];
      if (params?.status) items = items.filter((t) => t.status === params.status);
      return ok({ items, total: items.length });
    },
    get: async (id: string) => {
      await delay(200);
      const task = tasksStore.find((t) => t.id === id);
      if (!task) throw Object.assign(new Error("Task not found"), { status: 404 });
      return ok(task);
    },
    create: async (data: { title: string; description: string; priority?: string }) => {
      await delay(500);
      const task: Task = {
        id: `task-${Date.now()}`,
        user_id: DEMO_USER.id,
        title: data.title,
        description: data.description,
        status: "pending",
        priority: (data.priority as Task["priority"]) || "medium",
        progress: 0,
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        steps: [],
      };
      tasksStore = [task, ...tasksStore];
      return ok(task);
    },
    cancel: async (id: string) => {
      await delay(200);
      tasksStore = tasksStore.map((t) =>
        t.id === id ? { ...t, status: "cancelled" as const } : t
      );
      return ok({ message: "Cancelled" });
    },
    delete: async (id: string) => {
      await delay(200);
      tasksStore = tasksStore.filter((t) => t.id !== id);
      return ok({ message: "Deleted" });
    },
  },

  agents: {
    list: async () => { await delay(300); return ok({ items: agentsStore }); },
    get: async (id: string) => {
      await delay(200);
      const agent = agentsStore.find((a) => a.id === id);
      if (!agent) throw Object.assign(new Error("Agent not found"), { status: 404 });
      return ok(agent);
    },
    start: async (id: string) => {
      await delay(300);
      const idx = agentsStore.findIndex((a) => a.id === id);
      if (idx !== -1) agentsStore[idx] = { ...agentsStore[idx], status: "idle" };
      return ok({ message: "Started" });
    },
    stop: async (id: string) => {
      await delay(300);
      const idx = agentsStore.findIndex((a) => a.id === id);
      if (idx !== -1) agentsStore[idx] = { ...agentsStore[idx], status: "idle" };
      return ok({ message: "Stopped" });
    },
  },

  voice: {
    transcribe: async () => {
      await delay(1000);
      return ok({ text: "This is a demo transcription. The voice backend is not running.", confidence: 0.95 });
    },
    synthesize: async () => {
      await delay(500);
      return ok(new Blob([], { type: "audio/mp3" }));
    },
  },

  analytics: {
    usage: async () => { await delay(300); return ok(DEMO_ANALYTICS.usage); },
    daily: async () => { await delay(300); return ok({ items: DEMO_ANALYTICS.daily }); },
    models: async () => { await delay(300); return ok({ items: DEMO_ANALYTICS.models }); },
  },

  workflows: {
    list: async () => {
      await delay(300);
      return ok({ items: workflowsStore, total: workflowsStore.length });
    },
    get: async (id: string) => {
      await delay(200);
      const wf = workflowsStore.find((w) => w.id === id);
      if (!wf) throw Object.assign(new Error("Workflow not found"), { status: 404 });
      return ok(wf);
    },
    create: async (data: {
      name: string;
      description?: string;
      nodes: WorkflowNode[];
      edges: WorkflowEdge[];
      is_active?: boolean;
    }) => {
      await delay(400);
      const now = new Date().toISOString();
      const wf: Workflow = {
        id: `wf-${Date.now()}`,
        user_id: DEMO_USER.id,
        name: data.name,
        description: data.description,
        nodes: data.nodes,
        edges: data.edges,
        is_active: data.is_active ?? true,
        created_at: now,
        updated_at: now,
      };
      workflowsStore = [wf, ...workflowsStore];
      return ok(wf);
    },
    update: async (
      id: string,
      data: Partial<{
        name: string;
        description: string;
        nodes: WorkflowNode[];
        edges: WorkflowEdge[];
        is_active: boolean;
      }>
    ) => {
      await delay(300);
      const existing = workflowsStore.find((w) => w.id === id);
      if (!existing) throw Object.assign(new Error("Workflow not found"), { status: 404 });
      workflowsStore = workflowsStore.map((w) =>
        w.id === id ? { ...w, ...data, updated_at: new Date().toISOString() } : w
      );
      return ok(workflowsStore.find((w) => w.id === id));
    },
    delete: async (id: string) => {
      await delay(200);
      workflowsStore = workflowsStore.filter((w) => w.id !== id);
      workflowRunsStore = workflowRunsStore.filter((r) => r.workflow_id !== id);
      return ok({ message: "Deleted" });
    },
    run: async (id: string, input: string) => {
      await delay(600);
      const wf = workflowsStore.find((w) => w.id === id);
      if (!wf) throw Object.assign(new Error("Workflow not found"), { status: 404 });
      const run = simulateWorkflowRun(wf, input);
      workflowRunsStore = [run, ...workflowRunsStore];
      return ok(run);
    },
    runs: async (id: string) => {
      await delay(250);
      const items = workflowRunsStore
        .filter((r) => r.workflow_id === id)
        .sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
      return ok({ items, total: items.length });
    },
    getRun: async (runId: string) => {
      await delay(200);
      const run = workflowRunsStore.find((r) => r.id === runId);
      if (!run) throw Object.assign(new Error("Run not found"), { status: 404 });
      return ok(run);
    },
  },

  schedules: {
    list: async () => {
      await delay(300);
      return ok({ items: schedulesStore, total: schedulesStore.length });
    },
    create: async (data: {
      name: string;
      cron: string;
      target_type: ScheduleTargetType;
      workflow_id?: string;
      prompt?: string;
      is_active?: boolean;
    }) => {
      await delay(400);
      const now = new Date().toISOString();
      const schedule: Schedule = {
        id: `sched-${Date.now()}`,
        user_id: DEMO_USER.id,
        name: data.name,
        cron: data.cron,
        target_type: data.target_type,
        workflow_id: data.target_type === "workflow" ? data.workflow_id : undefined,
        prompt: data.target_type === "prompt" ? data.prompt : undefined,
        is_active: data.is_active ?? true,
        next_run_at: naiveNextRun(data.cron),
        created_at: now,
        updated_at: now,
      };
      schedulesStore = [schedule, ...schedulesStore];
      return ok(schedule);
    },
    update: async (
      id: string,
      data: Partial<{
        name: string;
        cron: string;
        target_type: ScheduleTargetType;
        workflow_id: string;
        prompt: string;
        is_active: boolean;
      }>
    ) => {
      await delay(300);
      const existing = schedulesStore.find((s) => s.id === id);
      if (!existing) throw Object.assign(new Error("Schedule not found"), { status: 404 });
      schedulesStore = schedulesStore.map((s) =>
        s.id === id
          ? {
              ...s,
              ...data,
              next_run_at: data.cron ? naiveNextRun(data.cron) : s.next_run_at,
              updated_at: new Date().toISOString(),
            }
          : s
      );
      return ok(schedulesStore.find((s) => s.id === id));
    },
    delete: async (id: string) => {
      await delay(200);
      schedulesStore = schedulesStore.filter((s) => s.id !== id);
      return ok({ message: "Deleted" });
    },
    toggle: async (id: string) => {
      await delay(200);
      const existing = schedulesStore.find((s) => s.id === id);
      if (!existing) throw Object.assign(new Error("Schedule not found"), { status: 404 });
      schedulesStore = schedulesStore.map((s) =>
        s.id === id
          ? {
              ...s,
              is_active: !s.is_active,
              next_run_at: !s.is_active ? naiveNextRun(s.cron) : undefined,
              updated_at: new Date().toISOString(),
            }
          : s
      );
      return ok(schedulesStore.find((s) => s.id === id));
    },
    runNow: async (id: string) => {
      await delay(500);
      const existing = schedulesStore.find((s) => s.id === id);
      if (!existing) throw Object.assign(new Error("Schedule not found"), { status: 404 });
      // If the schedule targets a workflow, actually simulate a run so it shows up in history
      if (existing.target_type === "workflow" && existing.workflow_id) {
        const wf = workflowsStore.find((w) => w.id === existing.workflow_id);
        if (wf) {
          const run = simulateWorkflowRun(wf, `Scheduled run: ${existing.name}`);
          workflowRunsStore = [run, ...workflowRunsStore];
        }
      }
      const now = new Date().toISOString();
      schedulesStore = schedulesStore.map((s) =>
        s.id === id
          ? {
              ...s,
              last_run_at: now,
              last_status: "completed",
              next_run_at: s.is_active ? naiveNextRun(s.cron) : s.next_run_at,
              updated_at: now,
            }
          : s
      );
      return ok(schedulesStore.find((s) => s.id === id));
    },
  },

  apikeys: {
    list: async () => {
      await delay(300);
      // Never include the full key in list responses — matches the real API
      return ok({ items: apiKeysStore, total: apiKeysStore.length });
    },
    create: async (name: string) => {
      await delay(400);
      const suffix = Array.from({ length: 3 }, () => Math.random().toString(36).slice(2, 10)).join("");
      const key = `jrv_demo_${suffix}`;
      const now = new Date().toISOString();
      const record: ApiKey = {
        id: `key-${Date.now()}`,
        name,
        key_prefix: key.slice(0, 12),
        revoked: false,
        created_at: now,
      };
      apiKeysStore = [record, ...apiKeysStore];
      const created: ApiKeyCreated = {
        id: record.id,
        name: record.name,
        key_prefix: record.key_prefix,
        created_at: record.created_at,
        key,
      };
      return ok(created);
    },
    revoke: async (id: string) => {
      await delay(200);
      const existing = apiKeysStore.find((k) => k.id === id);
      if (!existing) throw Object.assign(new Error("API key not found"), { status: 404 });
      apiKeysStore = apiKeysStore.map((k) => (k.id === id ? { ...k, revoked: true } : k));
      return ok({ message: "Revoked" });
    },
  },

  integrations: {
    list: async () => {
      await delay(300);
      return ok({ items: integrationsStore, total: integrationsStore.length });
    },
    create: async (data: {
      provider: IntegrationProvider;
      name: string;
      credentials: Record<string, string>;
      config?: Record<string, unknown>;
    }) => {
      await delay(500);
      const now = new Date().toISOString();
      // Credentials are write-only — the mock only records that they exist
      const integration: Integration = {
        id: `int-${Date.now()}`,
        user_id: DEMO_USER.id,
        provider: data.provider,
        name: data.name,
        has_credentials: Object.keys(data.credentials ?? {}).length > 0,
        config: data.config ?? {},
        status: "connected",
        created_at: now,
        updated_at: now,
      };
      integrationsStore = [...integrationsStore, integration];
      return ok(integration);
    },
    update: async (
      id: string,
      data: Partial<{
        name: string;
        credentials: Record<string, string>;
        config: Record<string, unknown>;
      }>
    ) => {
      await delay(300);
      const existing = integrationsStore.find((i) => i.id === id);
      if (!existing) throw Object.assign(new Error("Integration not found"), { status: 404 });
      integrationsStore = integrationsStore.map((i) =>
        i.id === id
          ? {
              ...i,
              name: data.name ?? i.name,
              config: data.config ?? i.config,
              has_credentials: data.credentials ? true : i.has_credentials,
              status: data.credentials ? ("connected" as const) : i.status,
              last_error: data.credentials ? undefined : i.last_error,
              updated_at: new Date().toISOString(),
            }
          : i
      );
      return ok(integrationsStore.find((i) => i.id === id));
    },
    delete: async (id: string) => {
      await delay(200);
      integrationsStore = integrationsStore.filter((i) => i.id !== id);
      return ok({ message: "Deleted" });
    },
    test: async (id: string) => {
      await delay(500);
      const existing = integrationsStore.find((i) => i.id === id);
      if (!existing) throw Object.assign(new Error("Integration not found"), { status: 404 });
      integrationsStore = integrationsStore.map((i) =>
        i.id === id
          ? { ...i, status: "connected" as const, last_error: undefined, updated_at: new Date().toISOString() }
          : i
      );
      return ok({ status: "connected" });
    },
    action: async (id: string, action: string, params: Record<string, unknown> = {}) => {
      const integration = integrationsStore.find((i) => i.id === id);
      if (!integration) throw Object.assign(new Error("Integration not found"), { status: 404 });
      switch (action) {
        case "list_repos":
          await delay(600);
          return ok({ result: DEMO_GITHUB_REPOS });
        case "list_prs":
          await delay(500);
          return ok({ result: DEMO_GITHUB_PRS });
        case "summarize_pr":
          await delay(1200);
          return ok({
            result: buildDemoPRSummary(String(params.repo ?? "unknown/repo"), Number(params.number ?? 0)),
          });
        case "create_issue":
          await delay(700);
          return ok({
            result: { number: 42, url: `https://github.com/${String(params.repo ?? "demo/repo")}/issues/42` },
          });
        case "send_message":
          await delay(500);
          return ok({ result: { ok: true } });
        case "create_page":
          await delay(700);
          return ok({ result: { id: "demo-notion-page", url: "https://notion.so/demo-notion-page" } });
        default:
          throw Object.assign(new Error(`Unknown action "${action}" for provider ${integration.provider}`), { status: 400 });
      }
    },
  },

  webhooks: {
    listTriggers: async () => {
      await delay(300);
      return ok({ items: webhookTriggersStore, total: webhookTriggersStore.length });
    },
    createTrigger: async (data: { name: string; workflow_id: string }) => {
      await delay(400);
      const token = `whk_demo_${Math.random().toString(36).slice(2, 12)}`;
      const trigger: WebhookTrigger = {
        id: `whk-${Date.now()}`,
        user_id: DEMO_USER.id,
        name: data.name,
        token,
        workflow_id: data.workflow_id,
        url: `http://localhost:8000/api/v1/hooks/${token}`,
        is_active: true,
        trigger_count: 0,
        created_at: new Date().toISOString(),
      };
      webhookTriggersStore = [trigger, ...webhookTriggersStore];
      return ok(trigger);
    },
    deleteTrigger: async (id: string) => {
      await delay(200);
      webhookTriggersStore = webhookTriggersStore.filter((t) => t.id !== id);
      return ok({ message: "Deleted" });
    },
    toggleTrigger: async (id: string) => {
      await delay(200);
      const existing = webhookTriggersStore.find((t) => t.id === id);
      if (!existing) throw Object.assign(new Error("Webhook trigger not found"), { status: 404 });
      webhookTriggersStore = webhookTriggersStore.map((t) =>
        t.id === id ? { ...t, is_active: !t.is_active } : t
      );
      return ok(webhookTriggersStore.find((t) => t.id === id));
    },
    listOutgoing: async () => {
      await delay(300);
      return ok({ items: outgoingWebhooksStore, total: outgoingWebhooksStore.length });
    },
    createOutgoing: async (data: { name: string; url: string; events: WebhookEvent[]; secret?: string }) => {
      await delay(400);
      const webhook: OutgoingWebhook = {
        id: `owh-${Date.now()}`,
        user_id: DEMO_USER.id,
        name: data.name,
        url: data.url,
        events: data.events,
        secret: data.secret ?? null,
        is_active: true,
        created_at: new Date().toISOString(),
      };
      outgoingWebhooksStore = [webhook, ...outgoingWebhooksStore];
      return ok(webhook);
    },
    updateOutgoing: async (
      id: string,
      data: Partial<{ name: string; url: string; events: WebhookEvent[]; secret: string; is_active: boolean }>
    ) => {
      await delay(300);
      const existing = outgoingWebhooksStore.find((w) => w.id === id);
      if (!existing) throw Object.assign(new Error("Outgoing webhook not found"), { status: 404 });
      outgoingWebhooksStore = outgoingWebhooksStore.map((w) => (w.id === id ? { ...w, ...data } : w));
      return ok(outgoingWebhooksStore.find((w) => w.id === id));
    },
    deleteOutgoing: async (id: string) => {
      await delay(200);
      outgoingWebhooksStore = outgoingWebhooksStore.filter((w) => w.id !== id);
      return ok({ message: "Deleted" });
    },
    testOutgoing: async (id: string) => {
      await delay(600);
      const existing = outgoingWebhooksStore.find((w) => w.id === id);
      if (!existing) throw Object.assign(new Error("Outgoing webhook not found"), { status: 404 });
      outgoingWebhooksStore = outgoingWebhooksStore.map((w) =>
        w.id === id ? { ...w, last_status: "200 OK" } : w
      );
      return ok({ status: "200 OK" });
    },
  },

  workspaces: {
    list: async () => {
      await delay(300);
      return ok(workspacesStore);
    },
    create: async (data: { name: string }) => {
      await delay(400);
      const now = new Date().toISOString();
      const ws: Workspace = {
        id: `ws-${Date.now()}`,
        name: data.name,
        owner_id: DEMO_USER.id,
        member_count: 1,
        my_role: "admin",
        created_at: now,
        updated_at: now,
      };
      workspacesStore = [...workspacesStore, ws];
      workspaceMembersStore[ws.id] = [
        { user_id: DEMO_USER.id, username: DEMO_USER.username, email: DEMO_USER.email, role: "admin", joined_at: now },
      ];
      workspaceInvitesStore[ws.id] = [];
      sharedConversationsStore[ws.id] = [];
      return ok(ws);
    },
    update: async (id: string, data: { name: string }) => {
      await delay(300);
      const existing = workspacesStore.find((w) => w.id === id);
      if (!existing) throw Object.assign(new Error("Workspace not found"), { status: 404 });
      workspacesStore = workspacesStore.map((w) =>
        w.id === id ? { ...w, name: data.name, updated_at: new Date().toISOString() } : w
      );
      return ok(workspacesStore.find((w) => w.id === id));
    },
    delete: async (id: string) => {
      await delay(300);
      workspacesStore = workspacesStore.filter((w) => w.id !== id);
      delete workspaceMembersStore[id];
      delete workspaceInvitesStore[id];
      delete sharedConversationsStore[id];
      return ok({ message: "Deleted" });
    },
    members: async (id: string) => {
      await delay(250);
      return ok(workspaceMembersStore[id] ?? []);
    },
    removeMember: async (id: string, userId: string) => {
      await delay(250);
      workspaceMembersStore[id] = (workspaceMembersStore[id] ?? []).filter((m) => m.user_id !== userId);
      workspacesStore = workspacesStore.map((w) =>
        w.id === id ? { ...w, member_count: (workspaceMembersStore[id] ?? []).length, updated_at: new Date().toISOString() } : w
      );
      return ok({ message: "Removed" });
    },
    setRole: async (id: string, userId: string, role: WorkspaceRole) => {
      await delay(250);
      workspaceMembersStore[id] = (workspaceMembersStore[id] ?? []).map((m) =>
        m.user_id === userId ? { ...m, role } : m
      );
      return ok(workspaceMembersStore[id]?.find((m) => m.user_id === userId));
    },
    createInvite: async (id: string, data: { email: string; role: WorkspaceRole }) => {
      await delay(400);
      const token = `wsinv_demo_${Math.random().toString(36).slice(2, 14)}`;
      const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
      const invite: WorkspaceInvite = {
        id: `wsinv-${Date.now()}`,
        email: data.email,
        role: data.role,
        token,
        invite_url: `${origin}/workspace/invite?token=${token}`,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
      };
      workspaceInvitesStore[id] = [invite, ...(workspaceInvitesStore[id] ?? [])];
      return ok(invite);
    },
    listInvites: async (id: string) => {
      await delay(250);
      return ok(workspaceInvitesStore[id] ?? []);
    },
    revokeInvite: async (id: string, inviteId: string) => {
      await delay(250);
      workspaceInvitesStore[id] = (workspaceInvitesStore[id] ?? []).filter((i) => i.id !== inviteId);
      return ok({ message: "Revoked" });
    },
    acceptInvite: async (token: string) => {
      await delay(400);
      for (const ws of workspacesStore) {
        const invite = (workspaceInvitesStore[ws.id] ?? []).find((i) => i.token === token);
        if (invite) {
          workspaceInvitesStore[ws.id] = (workspaceInvitesStore[ws.id] ?? []).filter((i) => i.token !== token);
          const members = workspaceMembersStore[ws.id] ?? [];
          if (!members.some((m) => m.user_id === DEMO_USER.id)) {
            workspaceMembersStore[ws.id] = [
              ...members,
              { user_id: DEMO_USER.id, username: DEMO_USER.username, email: DEMO_USER.email, role: invite.role, joined_at: new Date().toISOString() },
            ];
            workspacesStore = workspacesStore.map((w) =>
              w.id === ws.id ? { ...w, member_count: (workspaceMembersStore[ws.id] ?? []).length } : w
            );
          }
          return ok(workspacesStore.find((w) => w.id === ws.id));
        }
      }
      throw Object.assign(new Error("Invalid or expired invite token"), { status: 404 });
    },
    shareConversation: async (id: string, conversationId: string) => {
      await delay(300);
      const conv = conversations.find((c) => c.id === conversationId);
      if (!conv) throw Object.assign(new Error("Conversation not found"), { status: 404 });
      const shared = sharedConversationsStore[id] ?? [];
      if (!shared.some((s) => s.id === conversationId)) {
        sharedConversationsStore[id] = [
          { id: conv.id, title: conv.title, user_id: DEMO_USER.id, updated_at: conv.last_message_at ?? conv.created_at },
          ...shared,
        ];
      }
      return ok({ message: "Shared" });
    },
    unshareConversation: async (id: string, conversationId: string) => {
      await delay(300);
      sharedConversationsStore[id] = (sharedConversationsStore[id] ?? []).filter((s) => s.id !== conversationId);
      return ok({ message: "Unshared" });
    },
    sharedConversations: async (id: string) => {
      await delay(250);
      return ok(sharedConversationsStore[id] ?? []);
    },
  },

  push: {
    vapidKey: async () => {
      await delay(150);
      return ok({ key: DEMO_VAPID_PUBLIC_KEY });
    },
    subscribe: async (data: PushSubscriptionPayload) => {
      await delay(300);
      pushSubscriptionsStore = [
        ...pushSubscriptionsStore.filter((s) => s.endpoint !== data.endpoint),
        data,
      ];
      return ok({ message: "Subscribed" });
    },
    unsubscribe: async (endpoint: string) => {
      await delay(300);
      pushSubscriptionsStore = pushSubscriptionsStore.filter((s) => s.endpoint !== endpoint);
      return ok({ message: "Unsubscribed" });
    },
  },

  withRetry: async <T>(fn: () => Promise<T>) => fn(),
};
