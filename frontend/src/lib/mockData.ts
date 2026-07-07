import type {
  User,
  ConversationSummary,
  Message,
  Memory,
  Task,
  Agent,
  Document,
  Workflow,
  WorkflowRun,
  Schedule,
  ApiKey,
  Integration,
  GithubRepo,
  GithubPR,
  PRSummary,
  WebhookTrigger,
  OutgoingWebhook,
  Workspace,
  WorkspaceMember,
  WorkspaceInvite,
  SharedConversation,
  WorkspacePresenceUser,
  UsageSummary,
  UsageDaily,
  UsageByModel,
  TopConversationUsage,
  AuditLog,
  AdminStats,
  AdminUser,
} from "@/types";

// ─── Demo credentials ────────────────────────────────────────────────────────
export const DEMO_EMAIL    = "demo@jarvis.ai";
export const DEMO_PASSWORD = "jarvis2025";
export const DEMO_TOKEN    = "demo_token_jarvis_2025";

// ─── Demo user ───────────────────────────────────────────────────────────────
export const DEMO_USER: User = {
  id: "demo-user-001",
  email: DEMO_EMAIL,
  username: "tony_stark",
  display_name: "Tony Stark",
  avatar_url: undefined,
  is_admin: true,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2026-06-27T00:00:00Z",
  preferences: {
    theme: "dark",
    language: "en",
    voice_enabled: true,
    default_model: "claude-sonnet-4-6",
    notifications_enabled: true,
    auto_speak: false,
    push_to_talk: true,
  },
};

// ─── Conversations ────────────────────────────────────────────────────────────
export const DEMO_CONVERSATIONS: ConversationSummary[] = [
  {
    id: "conv-001",
    title: "Arc Reactor Efficiency Analysis",
    last_message: "The new palladium-free design achieves 94.7% efficiency — I'll prepare the full report.",
    last_message_at: "2026-06-27T10:30:00Z",
    message_count: 4,
    token_count: 1240,
    model: "claude-sonnet-4-6",
    created_at: "2026-06-27T09:00:00Z",
    archived: false,
    pinned: true,
    tags: ["engineering", "arc-reactor"],
  },
  {
    id: "conv-002",
    title: "Project IRON MAN Status",
    last_message: "Suit Mark 85 diagnostics complete. All systems nominal.",
    last_message_at: "2026-06-26T18:00:00Z",
    message_count: 4,
    token_count: 890,
    model: "claude-sonnet-4-6",
    created_at: "2026-06-26T12:00:00Z",
    archived: false,
    pinned: false,
    tags: ["iron-man", "diagnostics"],
  },
  {
    id: "conv-003",
    title: "Avengers Mission Debrief",
    last_message: "Casualties: zero. Property damage: $247M. Recommend infrastructure reinforcement.",
    last_message_at: "2026-06-25T22:15:00Z",
    message_count: 2,
    token_count: 1860,
    model: "claude-sonnet-4-6",
    created_at: "2026-06-25T20:00:00Z",
    archived: false,
    pinned: false,
    tags: ["avengers", "mission"],
  },
  {
    id: "conv-004",
    title: "Python Code Review",
    last_message: "I've refactored the trajectory module. Complexity reduced from O(n³) to O(n log n).",
    last_message_at: "2026-06-24T14:00:00Z",
    message_count: 2,
    token_count: 1420,
    model: "claude-sonnet-4-6",
    created_at: "2026-06-24T13:00:00Z",
    archived: false,
    pinned: false,
    tags: ["coding", "python"],
  },
];

// ─── Messages per conversation ────────────────────────────────────────────────
export const DEMO_MESSAGES: Record<string, Message[]> = {
  "conv-001": [
    { id: "msg-001-1", conversation_id: "conv-001", role: "user", content: "JARVIS, run a full efficiency analysis on the new arc reactor design.", status: "complete", created_at: "2026-06-27T09:05:00Z" },
    {
      id: "msg-001-2", conversation_id: "conv-001", role: "assistant", status: "complete", created_at: "2026-06-27T09:05:45Z",
      meta: {
        model: "claude-sonnet-4-6",
        provider: "anthropic",
        steps: [
          { type: "thinking", label: "Analyzing request", detail: "User wants a full efficiency analysis of the palladium-free arc reactor prototype. Planning diagnostic sweep and comparison against Mark IV baseline." },
          { type: "tool", label: "run_diagnostics(reactor='palladium-free-v2')", detail: "Executed reactor diagnostic suite — collected output, efficiency, thermal, and lifespan metrics in 3.2s." },
          { type: "retrieval", label: "Retrieved 3 chunks from Q3_report.pdf", detail: "Pulled Mark IV baseline figures (output 3.00 GW, efficiency 82.3%) for the comparison table. Top score 0.94." },
          { type: "thinking", label: "Composing answer", detail: "Formatting results as a comparison table per user's preference for concise technical reports." },
        ],
      },
      content: "Initiating arc reactor efficiency analysis. Running diagnostics on the palladium-free prototype...\n\n**Analysis Results:**\n\n| Metric | Mark IV | New Design | Delta |\n|--------|---------|------------|-------|\n| Output (GW) | 3.00 | 3.47 | +15.7% |\n| Efficiency | 82.3% | 94.7% | +12.4% |\n| Heat dissipation | 210°C | 178°C | -15.2% |\n| Estimated lifespan | 18 months | 36 months | +100% |\n\nThe new palladium-free design achieves **94.7% efficiency** — a significant improvement. Thermal load reduction is particularly notable.\n\nShall I prepare a full technical report for the engineering team?",
    },
    { id: "msg-001-3", conversation_id: "conv-001", role: "user", content: "Yes, and cross-reference with the suit power requirements for Mark 85.", status: "complete", created_at: "2026-06-27T09:10:00Z" },
    {
      id: "msg-001-4", conversation_id: "conv-001", role: "assistant", status: "complete", created_at: "2026-06-27T10:30:00Z",
      meta: {
        model: "claude-sonnet-4-6",
        provider: "anthropic",
        steps: [
          { type: "retrieval", label: "Retrieved 4 chunks from Q3_report.pdf", detail: "Located Mark 85 power budget section (flight, repulsors, nanotech, life support). Top score 0.91." },
          { type: "thinking", label: "Cross-referencing specs", detail: "Comparing 3.47 GW reactor output against 1.92 GW peak suit draw — computing headroom and compatibility verdict." },
        ],
      },
      content: "Cross-referencing with Mark 85 power specifications...\n\n**Mark 85 Power Requirements:**\n- Flight systems: 0.8 GW\n- Repulsors (full charge): 0.6 GW\n- Nanotech deployment: 0.4 GW\n- Life support + sensors: 0.12 GW\n- **Total peak draw: 1.92 GW**\n\n**Compatibility Assessment:** ✅ Excellent\n\nThe new reactor's 3.47 GW output provides a **1.55 GW reserve** (80.7% headroom). The new palladium-free design achieves 94.7% efficiency — I'll prepare the full report.",
    },
  ],
  "conv-002": [
    { id: "msg-002-1", conversation_id: "conv-002", role: "user", content: "Run full diagnostics on Mark 85.", status: "complete", created_at: "2026-06-26T12:05:00Z" },
    {
      id: "msg-002-2", conversation_id: "conv-002", role: "assistant", status: "complete", created_at: "2026-06-26T12:06:00Z",
      content: "Running full diagnostic sweep on Iron Man Mark 85...\n\n```\nSYSTEM STATUS: NOMINAL\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n✓ Arc Reactor          3.47 GW  [94.7%]\n✓ Repulsor Array       OPTIMAL  [L:99% R:98%]\n✓ Nanotech Reserves    847/1000 particles\n✓ Structural Integrity 100%\n✓ Flight Systems       READY\n✓ AI Core (me)         OPERATIONAL\n⚠ Left gauntlet        Minor nanoparticle depletion [-1.3%]\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nOVERALL: MISSION READY\n```\n\nSuit Mark 85 diagnostics complete. All systems nominal.",
    },
  ],
  "conv-003": [
    { id: "msg-003-1", conversation_id: "conv-003", role: "user", content: "Generate a full mission debrief for the New York operation.", status: "complete", created_at: "2026-06-25T20:05:00Z" },
    {
      id: "msg-003-2", conversation_id: "conv-003", role: "assistant", status: "complete", created_at: "2026-06-25T22:15:00Z",
      meta: {
        model: "claude-sonnet-4-6",
        provider: "anthropic",
        steps: [
          { type: "thinking", label: "Planning debrief structure", detail: "Level 7 classification requires executive summary, statistics, and recommendations sections." },
          { type: "retrieval", label: "Retrieved 2 chunks from meeting_notes.md", detail: "Pulled operation timeline and casualty figures logged during the engagement. Top score 0.88." },
          { type: "tool", label: "aggregate_telemetry(op='new-york')", detail: "Aggregated suit and satellite telemetry: 847 hostiles neutralized, $247M property damage estimate." },
        ],
      },
      content: "# Avengers Mission Debrief — New York Operation\n**Classification:** Level 7 | **Date:** 2026-06-25\n\n## Executive Summary\nOperation concluded successfully. All primary objectives achieved with zero civilian casualties.\n\n## Statistics\n- **Duration:** 4h 23m\n- **Hostile contacts neutralized:** 847\n- **Civilian injuries:** 0\n- **Property damage:** $247,000,000\n\n## Recommendations\nCasualties: zero. Property damage: $247M. Recommend infrastructure reinforcement on the 5th Avenue corridor.",
    },
  ],
  "conv-004": [
    { id: "msg-004-1", conversation_id: "conv-004", role: "user", content: "Review my missile trajectory code. It's running slow.", status: "complete", created_at: "2026-06-24T13:05:00Z" },
    {
      id: "msg-004-2", conversation_id: "conv-004", role: "assistant", status: "complete", created_at: "2026-06-24T14:00:00Z",
      content: "I've analyzed the trajectory module. The bottleneck is a nested loop with O(n³) complexity.\n\n**After (O(n log n) using KDTree):**\n```python\nfrom scipy.spatial import KDTree\n\ndef calculate_intercept_path(targets, obstacles):\n    tree = KDTree([o.position for o in obstacles])\n    paths = []\n    for t in targets:\n        nearby = tree.query_ball_point(t.position, r=THREAT_RADIUS)\n        relevant = [obstacles[i] for i in nearby]\n        paths.append(compute_path(t, relevant))\n    return paths\n```\n\nComplexity reduced from O(n³) to O(n log n). Benchmark: **47× speedup** on 1000-target scenarios.",
    },
  ],
};

// ─── Memories ─────────────────────────────────────────────────────────────────
export const DEMO_MEMORIES: Memory[] = [
  { id: "mem-001", user_id: "demo-user-001", type: "preference", content: "User's preferred AI model is claude-sonnet-4-6 for complex reasoning tasks.", summary: "Preferred model: claude-sonnet-4-6", importance: 5, tags: ["preferences", "ai", "model"], access_count: 47, created_at: "2026-01-15T00:00:00Z", updated_at: "2026-06-27T10:00:00Z", last_accessed: "2026-06-27T10:00:00Z" },
  { id: "mem-002", user_id: "demo-user-001", type: "preference", content: "User prefers concise technical reports with data tables rather than lengthy prose.", summary: "Prefers concise technical format", importance: 4, tags: ["preferences", "communication"], access_count: 32, created_at: "2026-02-01T00:00:00Z", updated_at: "2026-06-26T18:00:00Z", last_accessed: "2026-06-26T18:00:00Z" },
  { id: "mem-003", user_id: "demo-user-001", type: "fact", content: "User is working on a palladium-free arc reactor design targeting 95%+ efficiency.", summary: "Arc reactor project: palladium-free, 95%+ target", importance: 5, tags: ["project", "arc-reactor", "engineering"], access_count: 18, created_at: "2026-06-01T00:00:00Z", updated_at: "2026-06-27T09:30:00Z", last_accessed: "2026-06-27T09:30:00Z" },
  { id: "mem-004", user_id: "demo-user-001", type: "fact", content: "Iron Man Mark 85 is the current suit. Mark 86 design phase begins Q3 2026.", summary: "Current suit: Mark 85; Mark 86 planned Q3 2026", importance: 4, tags: ["project", "iron-man", "engineering"], access_count: 25, created_at: "2026-03-10T00:00:00Z", updated_at: "2026-06-26T12:00:00Z" },
  { id: "mem-005", user_id: "demo-user-001", type: "preference", content: "User starts the day with a systems status briefing before any other tasks.", summary: "Morning routine: systems status briefing first", importance: 3, tags: ["preferences", "routine"], access_count: 61, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-06-27T07:00:00Z", last_accessed: "2026-06-27T07:00:00Z" },
  { id: "mem-006", user_id: "demo-user-001", type: "skill", content: "User's primary programming languages are Python and C++ for performance-critical systems.", summary: "Languages: Python (primary), C++ (performance-critical)", importance: 4, tags: ["skills", "programming"], access_count: 14, created_at: "2026-02-20T00:00:00Z", updated_at: "2026-06-24T14:00:00Z" },
  { id: "mem-007", user_id: "demo-user-001", type: "fact", content: "Stark Industries R&D budget for FY2026 is $4.2B, up 18% from prior year.", summary: "FY2026 R&D budget: $4.2B (+18%)", importance: 3, tags: ["business", "finance"], access_count: 5, created_at: "2026-01-10T00:00:00Z", updated_at: "2026-06-20T00:00:00Z" },
  { id: "mem-008", user_id: "demo-user-001", type: "preference", content: "User prefers voice mode for quick queries and text mode for detailed analysis.", summary: "Voice for quick queries, text for detailed analysis", importance: 3, tags: ["preferences", "voice", "interface"], access_count: 29, created_at: "2026-01-20T00:00:00Z", updated_at: "2026-06-27T08:00:00Z", last_accessed: "2026-06-27T08:00:00Z" },
];

// ─── Tasks ────────────────────────────────────────────────────────────────────
export const DEMO_TASKS: Task[] = [
  {
    id: "task-001", user_id: "demo-user-001",
    title: "Compile weekly engineering reports",
    description: "Aggregate all R&D sub-team reports into a single executive summary.",
    status: "completed", priority: "high", progress: 100, tags: ["reports"],
    created_at: "2026-06-27T08:00:00Z", updated_at: "2026-06-27T08:45:00Z",
    started_at: "2026-06-27T08:01:00Z", completed_at: "2026-06-27T08:45:00Z",
    steps: [
      { id: "s1", description: "Fetch reports from all 6 sub-teams", status: "completed" },
      { id: "s2", description: "Summarize key metrics", status: "completed" },
      { id: "s3", description: "Generate executive summary PDF", status: "completed" },
    ],
  },
  {
    id: "task-002", user_id: "demo-user-001",
    title: "Analyze competitor patent filings",
    description: "Research new energy patents filed in the last 30 days by Hammer Industries.",
    status: "running", priority: "medium", progress: 45, tags: ["research", "ip"],
    created_at: "2026-06-27T09:30:00Z", updated_at: "2026-06-27T10:00:00Z",
    started_at: "2026-06-27T09:31:00Z",
    steps: [
      { id: "s1", description: "Search USPTO database", status: "completed" },
      { id: "s2", description: "Filter energy-related patents", status: "running" },
      { id: "s3", description: "Cross-reference with Stark IP", status: "pending" },
    ],
  },
  {
    id: "task-003", user_id: "demo-user-001",
    title: "Refactor suit telemetry system",
    description: "Optimize the real-time telemetry pipeline to reduce latency from 48ms to under 10ms.",
    status: "pending", priority: "high", progress: 0, tags: ["coding", "performance"],
    created_at: "2026-06-27T10:00:00Z", updated_at: "2026-06-27T10:00:00Z",
    steps: [
      { id: "s1", description: "Profile current pipeline bottlenecks", status: "pending" },
      { id: "s2", description: "Implement async event stream", status: "pending" },
    ],
  },
  {
    id: "task-004", user_id: "demo-user-001",
    title: "Monitor Hydra communication channels",
    description: "Passive surveillance of known Hydra frequency bands.",
    status: "failed", priority: "critical", progress: 40, tags: ["security"],
    created_at: "2026-06-26T20:00:00Z", updated_at: "2026-06-26T21:00:00Z",
    started_at: "2026-06-26T20:01:00Z",
    error: "Decryption failed: unknown cipher protocol",
    steps: [
      { id: "s1", description: "Initialize frequency scanner", status: "completed" },
      { id: "s2", description: "Decrypt intercepted signals", status: "failed", error: "Unknown cipher" },
    ],
  },
  {
    id: "task-005", user_id: "demo-user-001",
    title: "Schedule Avengers team meeting",
    description: "Find a time slot that works for all 6 Avengers for next week's debrief.",
    status: "completed", priority: "low", progress: 100, tags: ["calendar"],
    created_at: "2026-06-26T15:00:00Z", updated_at: "2026-06-26T15:10:00Z",
    started_at: "2026-06-26T15:01:00Z", completed_at: "2026-06-26T15:10:00Z",
    steps: [
      { id: "s1", description: "Query all calendars", status: "completed" },
      { id: "s2", description: "Find overlapping availability", status: "completed" },
      { id: "s3", description: "Send invites", status: "completed" },
    ],
  },
];

// ─── Agents ───────────────────────────────────────────────────────────────────
export const DEMO_AGENTS: Agent[] = [
  { id: "planner",    name: "Planner",    type: "planner",    status: "idle",    description: "Task decomposition and dependency graph", capabilities: ["plan", "schedule", "prioritize"], tasks_completed: 142, tasks_failed: 2,  uptime_seconds: 86400, last_active: "2026-06-27T08:45:00Z", created_at: "2026-01-01T00:00:00Z" },
  { id: "research",   name: "Research",   type: "research",   status: "running", description: "Web research and information synthesis",   capabilities: ["search", "summarize", "verify"],   tasks_completed: 89,  tasks_failed: 5,  uptime_seconds: 72000, current_task_id: "task-002", last_active: "2026-06-27T10:00:00Z", created_at: "2026-01-01T00:00:00Z" },
  { id: "coding",     name: "Coding",     type: "coding",     status: "idle",    description: "Code generation, review, and refactoring",  capabilities: ["generate", "review", "debug"],     tasks_completed: 67,  tasks_failed: 3,  uptime_seconds: 50400, last_active: "2026-06-24T14:00:00Z", created_at: "2026-01-01T00:00:00Z" },
  { id: "browser",    name: "Browser",    type: "browser",    status: "idle",    description: "Web automation and data extraction",          capabilities: ["navigate", "scrape", "form-fill"], tasks_completed: 34,  tasks_failed: 1,  uptime_seconds: 36000, last_active: "2026-06-25T10:00:00Z", created_at: "2026-01-01T00:00:00Z" },
  { id: "vision",     name: "Vision",     type: "vision",     status: "idle",    description: "Screenshot analysis and OCR",                capabilities: ["screenshot", "ocr", "ui-detect"], tasks_completed: 23,  tasks_failed: 0,  uptime_seconds: 28800, last_active: "2026-06-23T09:00:00Z", created_at: "2026-01-01T00:00:00Z" },
  { id: "automation", name: "Automation", type: "automation", status: "idle",    description: "Desktop and OS automation",                  capabilities: ["mouse", "keyboard", "files"],      tasks_completed: 51,  tasks_failed: 4,  uptime_seconds: 43200, last_active: "2026-06-22T16:00:00Z", created_at: "2026-01-01T00:00:00Z" },
  { id: "memory",     name: "Memory",     type: "memory",     status: "idle",    description: "Memory extraction and consolidation",        capabilities: ["extract", "consolidate", "search"],tasks_completed: 210, tasks_failed: 1,  uptime_seconds: 86400, last_active: "2026-06-27T07:00:00Z", created_at: "2026-01-01T00:00:00Z" },
  { id: "email",      name: "Email",      type: "email",      status: "idle",    description: "Email reading and composition",              capabilities: ["read", "send", "draft"],           tasks_completed: 15,  tasks_failed: 0,  uptime_seconds: 14400, last_active: "2026-06-20T11:00:00Z", created_at: "2026-01-01T00:00:00Z" },
  { id: "calendar",   name: "Calendar",   type: "calendar",   status: "idle",    description: "Calendar management and scheduling",         capabilities: ["schedule", "list", "free-time"],   tasks_completed: 28,  tasks_failed: 0,  uptime_seconds: 21600, last_active: "2026-06-26T15:10:00Z", created_at: "2026-01-01T00:00:00Z" },
  { id: "security",   name: "Security",   type: "security",   status: "error",   description: "Security auditing and threat detection",     capabilities: ["scan", "audit", "classify-risk"],  tasks_completed: 9,   tasks_failed: 3,  uptime_seconds: 7200,  last_active: "2026-06-26T21:00:00Z", created_at: "2026-01-01T00:00:00Z" },
];

// ─── Documents (RAG) ──────────────────────────────────────────────────────────
export const DEMO_DOCUMENTS: Document[] = [
  {
    id: "doc-001",
    user_id: "demo-user-001",
    filename: "Q3_report.pdf",
    content_type: "application/pdf",
    size_bytes: 2_483_112,
    status: "ready",
    chunk_count: 84,
    created_at: "2026-06-20T09:15:00Z",
    updated_at: "2026-06-20T09:16:42Z",
  },
  {
    id: "doc-002",
    user_id: "demo-user-001",
    filename: "meeting_notes.md",
    content_type: "text/markdown",
    size_bytes: 18_764,
    status: "ready",
    chunk_count: 12,
    created_at: "2026-06-24T14:30:00Z",
    updated_at: "2026-06-24T14:30:08Z",
  },
  {
    id: "doc-003",
    user_id: "demo-user-001",
    filename: "research_paper.pdf",
    content_type: "application/pdf",
    size_bytes: 5_912_004,
    status: "processing",
    chunk_count: 0,
    created_at: "2026-06-27T10:28:00Z",
    updated_at: "2026-06-27T10:28:00Z",
  },
  {
    id: "doc-004",
    user_id: "demo-user-001",
    filename: "budget.csv",
    content_type: "text/csv",
    size_bytes: 421_388,
    status: "ready",
    chunk_count: 37,
    created_at: "2026-06-18T08:00:00Z",
    updated_at: "2026-06-18T08:00:31Z",
  },
];

// Fake chunk contents used by the mock document search
export const DEMO_DOCUMENT_CHUNKS: Array<{ document_id: string; filename: string; content: string }> = [
  { document_id: "doc-001", filename: "Q3_report.pdf", content: "Q3 revenue reached $18.4B, up 12% YoY, driven primarily by the clean energy division. Arc reactor licensing contributed $4.1B with efficiency improvements of 12.4% over baseline." },
  { document_id: "doc-001", filename: "Q3_report.pdf", content: "R&D expenditure for Q3 totaled $1.05B. The palladium-free reactor program consumed 34% of the budget, followed by nanotech materials research at 22%." },
  { document_id: "doc-001", filename: "Q3_report.pdf", content: "Mark 85 power budget: flight systems 0.8 GW, repulsors 0.6 GW, nanotech deployment 0.4 GW, life support and sensors 0.12 GW — total peak draw 1.92 GW." },
  { document_id: "doc-002", filename: "meeting_notes.md", content: "Engineering sync 2026-06-24: telemetry latency must drop below 10ms before the Mark 86 design phase. Pepper approved the additional compute budget for the simulation cluster." },
  { document_id: "doc-002", filename: "meeting_notes.md", content: "Action items: (1) Rhodey to validate repulsor firmware v9.2, (2) schedule wind-tunnel time for the new flight surfaces, (3) draft the Q3 board summary by Friday." },
  { document_id: "doc-004", filename: "budget.csv", content: "Line 42: Simulation cluster upgrade, $12,400,000, approved. Line 43: Nanoparticle fabrication lab, $8,750,000, pending review. Line 44: Satellite uplink maintenance, $1,200,000, approved." },
  { document_id: "doc-004", filename: "budget.csv", content: "FY2026 R&D allocation totals $4.2B across 6 divisions: energy 38%, materials 22%, defense 18%, AI systems 12%, aerospace 7%, misc 3%." },
];

// ─── Analytics ────────────────────────────────────────────────────────────────
export const DEMO_ANALYTICS = {
  usage: {
    total_tokens: 1_847_293,
    total_messages: 847,
    total_conversations: 38,
    avg_response_time_ms: 1240,
    total_tasks: 5,
    tasks_completed: 3,
    memory_count: 8,
    api_cost_usd: 4.72,
  },
  daily: [
    { date: "2026-06-21", messages: 42, tokens: 87_230, cost: 0.22 },
    { date: "2026-06-22", messages: 67, tokens: 134_102, cost: 0.34 },
    { date: "2026-06-23", messages: 38, tokens: 76_450, cost: 0.19 },
    { date: "2026-06-24", messages: 91, tokens: 183_200, cost: 0.46 },
    { date: "2026-06-25", messages: 124, tokens: 248_400, cost: 0.62 },
    { date: "2026-06-26", messages: 88, tokens: 176_600, cost: 0.44 },
    { date: "2026-06-27", messages: 56, tokens: 112_300, cost: 0.28 },
  ],
  models: [
    { model: "claude-sonnet-4-6",   tokens: 1_234_000, percentage: 66.8 },
    { model: "claude-haiku-4-5",    tokens: 412_000,   percentage: 22.3 },
    { model: "groq/llama-3.3-70b",  tokens: 201_293,   percentage: 10.9 },
  ],
};

// ─── Workflows ────────────────────────────────────────────────────────────────
export const DEMO_WORKFLOWS: Workflow[] = [
  {
    id: "wf-001",
    user_id: "demo-user-001",
    name: "Morning Briefing",
    description: "Compiles news, calendar and open tasks into a daily briefing.",
    nodes: [
      {
        id: "wf1-trigger",
        type: "trigger",
        position: { x: 60, y: 180 },
        data: { label: "Manual Trigger" },
      },
      {
        id: "wf1-research",
        type: "agent",
        position: { x: 340, y: 180 },
        data: {
          label: "Research Agent",
          agent_type: "research",
          prompt: "Compile a morning briefing: top news headlines, today's calendar, weather and open tasks. Focus: {input}",
        },
      },
      {
        id: "wf1-output",
        type: "output",
        position: { x: 620, y: 180 },
        data: { label: "Briefing Report" },
      },
    ],
    edges: [
      { id: "wf1-e1", source: "wf1-trigger", target: "wf1-research" },
      { id: "wf1-e2", source: "wf1-research", target: "wf1-output" },
    ],
    is_active: true,
    created_at: "2026-06-10T08:00:00Z",
    updated_at: "2026-07-04T07:45:00Z",
  },
  {
    id: "wf-002",
    user_id: "demo-user-001",
    name: "Code Review Pipeline",
    description: "Runs the coding agent over a diff and files a report when issues are found.",
    nodes: [
      {
        id: "wf2-trigger",
        type: "trigger",
        position: { x: 40, y: 220 },
        data: { label: "PR Submitted" },
      },
      {
        id: "wf2-coding",
        type: "agent",
        position: { x: 300, y: 220 },
        data: {
          label: "Coding Agent",
          agent_type: "coding",
          prompt: "Review the submitted code for bugs, style problems and security issues: {input}",
        },
      },
      {
        id: "wf2-condition",
        type: "condition",
        position: { x: 580, y: 220 },
        data: {
          label: "Issues Found?",
          condition: { field: "output", op: "contains", value: "issue" },
        },
      },
      {
        id: "wf2-output",
        type: "output",
        position: { x: 840, y: 220 },
        data: { label: "Review Report" },
      },
    ],
    edges: [
      { id: "wf2-e1", source: "wf2-trigger", target: "wf2-coding" },
      { id: "wf2-e2", source: "wf2-coding", target: "wf2-condition" },
      { id: "wf2-e3", source: "wf2-condition", target: "wf2-output" },
    ],
    is_active: true,
    created_at: "2026-06-18T14:20:00Z",
    updated_at: "2026-07-02T16:10:00Z",
  },
];

// ─── Workflow runs ────────────────────────────────────────────────────────────
export const DEMO_WORKFLOW_RUNS: WorkflowRun[] = [
  {
    id: "run-001",
    workflow_id: "wf-001",
    status: "completed",
    node_results: {
      "wf1-trigger": { status: "completed", output: "Focus on arc reactor program and board prep.", duration_ms: 4 },
      "wf1-research": {
        status: "completed",
        output:
          "[research agent] Morning briefing compiled — 3 relevant headlines (clean-energy policy vote passed, palladium futures down 4%, Hammer Industries filed 2 new patents), 4 calendar events today (board prep 10:00, wind-tunnel slot 14:00), weather clear 24°C, 3 open tasks carried over.",
        duration_ms: 1830,
      },
      "wf1-output": {
        status: "completed",
        output: "Briefing delivered to dashboard and inbox at 08:00.",
        duration_ms: 112,
      },
    },
    started_at: "2026-07-04T08:00:00Z",
    finished_at: "2026-07-04T08:00:02Z",
  },
  {
    id: "run-002",
    workflow_id: "wf-002",
    status: "completed",
    node_results: {
      "wf2-trigger": { status: "completed", output: "PR #482: telemetry pipeline refactor (14 files).", duration_ms: 3 },
      "wf2-coding": {
        status: "completed",
        output:
          "[coding agent] Review complete — 2 issues found: (1) unbounded queue growth in telemetry_buffer.py, (2) missing timeout on satellite uplink socket. 5 style nits. Suggested fixes attached.",
        duration_ms: 2410,
      },
      "wf2-condition": { status: "completed", output: "true — output contains \"issue\"", duration_ms: 6 },
      "wf2-output": {
        status: "completed",
        output: "Review report posted to PR #482 with 2 blocking comments.",
        duration_ms: 98,
      },
    },
    started_at: "2026-07-02T16:08:00Z",
    finished_at: "2026-07-02T16:08:03Z",
  },
];

// ─── Schedules ────────────────────────────────────────────────────────────────
export const DEMO_SCHEDULES: Schedule[] = [
  {
    id: "sched-001",
    user_id: "demo-user-001",
    name: "Daily Morning Briefing",
    cron: "0 8 * * *",
    target_type: "workflow",
    workflow_id: "wf-001",
    is_active: true,
    last_run_at: "2026-07-06T08:00:00Z",
    next_run_at: "2026-07-07T08:00:00Z",
    last_status: "completed",
    created_at: "2026-06-10T08:30:00Z",
    updated_at: "2026-07-06T08:00:00Z",
  },
  {
    id: "sched-002",
    user_id: "demo-user-001",
    name: "Weekday Standup Summary",
    cron: "0 9 * * 1-5",
    target_type: "prompt",
    prompt:
      "Summarize yesterday's completed tasks, today's priorities and any blockers across all active projects. Keep it under 10 bullet points.",
    is_active: true,
    last_run_at: "2026-07-03T09:00:00Z",
    next_run_at: "2026-07-06T09:00:00Z",
    last_status: "completed",
    created_at: "2026-06-15T11:00:00Z",
    updated_at: "2026-07-03T09:00:00Z",
  },
  {
    id: "sched-003",
    user_id: "demo-user-001",
    name: "Hourly System Check",
    cron: "0 * * * *",
    target_type: "prompt",
    prompt: "Run diagnostics on all agent subsystems and report anything anomalous.",
    is_active: false,
    last_run_at: "2026-06-30T22:00:00Z",
    last_status: "failed",
    created_at: "2026-06-20T09:00:00Z",
    updated_at: "2026-06-30T22:05:00Z",
  },
];

// ─── API keys ─────────────────────────────────────────────────────────────────
export const DEMO_API_KEYS: ApiKey[] = [
  {
    id: "key-001",
    name: "Home Automation Hub",
    key_prefix: "jrv_a81f4c",
    last_used_at: "2026-07-05T21:14:00Z",
    revoked: false,
    created_at: "2026-05-12T10:00:00Z",
  },
  {
    id: "key-002",
    name: "Legacy CLI Token",
    key_prefix: "jrv_09d7e2",
    last_used_at: "2026-04-02T08:30:00Z",
    revoked: true,
    created_at: "2026-02-01T09:00:00Z",
  },
];

// ─── Integrations ─────────────────────────────────────────────────────────────
export const DEMO_INTEGRATIONS: Integration[] = [
  {
    id: "int-001",
    user_id: "demo-user-001",
    provider: "github",
    name: "Personal GitHub",
    has_credentials: true,
    config: { username: "aqkprogrammer" },
    status: "connected",
    created_at: "2026-06-12T09:00:00Z",
    updated_at: "2026-07-05T18:30:00Z",
  },
  {
    id: "int-002",
    user_id: "demo-user-001",
    provider: "slack",
    name: "Team Slack",
    has_credentials: true,
    config: { default_channel: "#engineering" },
    status: "connected",
    created_at: "2026-06-15T14:00:00Z",
    updated_at: "2026-07-04T11:00:00Z",
  },
];

// ─── GitHub demo data (integration actions) ───────────────────────────────────
export const DEMO_GITHUB_REPOS: GithubRepo[] = [
  { full_name: "aqkprogrammer/jarvis", description: "Personal AI assistant platform — FastAPI backend + Next.js frontend", stars: 128, updated_at: "2026-07-05T20:12:00Z" },
  { full_name: "aqkprogrammer/dotfiles", description: "macOS setup: zsh, neovim, tmux and friends", stars: 34, updated_at: "2026-07-01T08:45:00Z" },
  { full_name: "aqkprogrammer/ml-experiments", description: "Notebooks and training runs for side-project models", stars: 57, updated_at: "2026-06-28T17:30:00Z" },
  { full_name: "aqkprogrammer/portfolio", description: null, stars: 12, updated_at: "2026-06-20T13:00:00Z" },
  { full_name: "aqkprogrammer/api-toolkit", description: "Typed HTTP client generators for internal APIs", stars: 89, updated_at: "2026-07-03T09:20:00Z" },
];

export const DEMO_GITHUB_PRS: GithubPR[] = [
  { number: 48, title: "Add webhook trigger support for workflows", user: "aqkprogrammer", created_at: "2026-07-04T15:20:00Z" },
  { number: 47, title: "Fix race condition in scheduler tick loop", user: "pepper-dev", created_at: "2026-07-03T11:05:00Z" },
  { number: 45, title: "Upgrade to Next.js 14.2 and fix strict-mode type errors", user: "rhodey-ops", created_at: "2026-07-01T09:40:00Z" },
];

/** Fabricates a realistic multi-paragraph AI review summary for a demo PR. */
export function buildDemoPRSummary(repo: string, number: number): PRSummary {
  const pr = DEMO_GITHUB_PRS.find((p) => p.number === number);
  const title = pr?.title ?? `PR #${number}`;
  const filesChanged = 4 + (number % 9);
  const summary = [
    `"${title}" (${repo}#${number}) is a well-scoped change touching ${filesChanged} files. The diff stays focused on the feature itself — implementation, route wiring and schema updates — with no unrelated refactoring mixed in, which keeps the review surface small.`,
    `Key changes:\n• Core implementation updated end to end, including request validation and error paths\n• Tests added for the success path plus two failure modes (invalid input, downstream timeout)\n• Type definitions and API schemas kept in sync with the runtime behavior`,
    `Risk assessment: LOW-MEDIUM. The change is backward compatible behind existing interfaces, but reviewers should verify the new code path emits metrics and that the added database access is covered by an index. Recommended before merge: run the migration against a staging snapshot and confirm p95 latency on the touched endpoint is unchanged.`,
  ].join("\n\n");
  return { summary, title, number, files_changed: filesChanged };
}

// ─── Incoming webhook triggers ────────────────────────────────────────────────
export const DEMO_WEBHOOK_TRIGGERS: WebhookTrigger[] = [
  {
    id: "whk-001",
    user_id: "demo-user-001",
    name: "CI Pipeline Hook",
    token: "whk_demo_8f2a91c4d7",
    workflow_id: "wf-001",
    url: "http://localhost:8000/api/v1/hooks/whk_demo_8f2a91c4d7",
    is_active: true,
    trigger_count: 17,
    last_triggered_at: "2026-07-05T22:41:00Z",
    created_at: "2026-06-20T10:00:00Z",
  },
];

// ─── Outgoing webhooks ────────────────────────────────────────────────────────
export const DEMO_OUTGOING_WEBHOOKS: OutgoingWebhook[] = [
  {
    id: "owh-001",
    user_id: "demo-user-001",
    name: "Ops Alerting",
    url: "https://ops.starkindustries.com/hooks/jarvis",
    events: ["workflow.completed", "workflow.failed"],
    secret: "whsec_demo_a1b2c3d4",
    is_active: true,
    last_status: "200 OK",
    created_at: "2026-06-22T16:00:00Z",
  },
];

// ─── Workspaces (team collaboration) ──────────────────────────────────────────
export const DEMO_WORKSPACE: Workspace = {
  id: "ws-001",
  name: "JARVIS Team",
  owner_id: DEMO_USER.id,
  member_count: 4,
  my_role: "admin",
  created_at: "2026-05-01T09:00:00Z",
  updated_at: "2026-07-05T16:20:00Z",
};

export const DEMO_WORKSPACE_MEMBERS: Record<string, WorkspaceMember[]> = {
  "ws-001": [
    { user_id: DEMO_USER.id, username: DEMO_USER.username, email: DEMO_USER.email, role: "admin", joined_at: "2026-05-01T09:00:00Z" },
    { user_id: "ws-user-002", username: "tony", email: "tony@stark.io", role: "admin", joined_at: "2026-05-02T10:15:00Z" },
    { user_id: "ws-user-003", username: "pepper", email: "pepper@stark.io", role: "member", joined_at: "2026-05-03T08:40:00Z" },
    { user_id: "ws-user-004", username: "happy", email: "happy@stark.io", role: "member", joined_at: "2026-05-10T14:05:00Z" },
  ],
};

export const DEMO_WORKSPACE_INVITES: Record<string, WorkspaceInvite[]> = {
  "ws-001": [
    {
      id: "wsinv-001",
      email: "rhodey@stark.io",
      role: "member",
      token: "wsinv_demo_7f3a91c2d8b4",
      invite_url: "http://localhost:3000/workspace/invite?token=wsinv_demo_7f3a91c2d8b4",
      expires_at: "2026-07-10T12:00:00Z",
      created_at: "2026-07-03T12:00:00Z",
    },
  ],
};

// Links an existing demo conversation (conv-001) into the demo workspace
export const DEMO_SHARED_CONVERSATIONS: Record<string, SharedConversation[]> = {
  "ws-001": [
    {
      id: "conv-001",
      title: "Arc Reactor Efficiency Analysis",
      user_id: DEMO_USER.id,
      updated_at: "2026-06-27T10:30:00Z",
    },
  ],
};

// Static presence snapshot used in demo mode (2 of the 4 members online, incl. the demo user)
export const DEMO_PRESENCE_USERS: WorkspacePresenceUser[] = [
  { user_id: DEMO_USER.id, username: DEMO_USER.username, connected_at: "2026-07-06T08:00:00Z" },
  { user_id: "ws-user-003", username: "pepper", connected_at: "2026-07-06T08:12:00Z" },
];

// ─── Push notifications ───────────────────────────────────────────────────────
// Fake VAPID public key (base64url) — only used to satisfy the demo flow
export const DEMO_VAPID_PUBLIC_KEY =
  "BDemoVapidPublicKey_0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ab";

// ─── Canned JARVIS responses for demo chat ────────────────────────────────────
export const DEMO_RESPONSES = [
  "Understood. I've processed your request and here's what I found:\n\nBased on the available data, I recommend proceeding with **Option A**. It offers the best balance of efficiency and risk mitigation. Shall I prepare a detailed implementation plan?",
  "Running analysis now...\n\n```\nProcessing: ████████████████████ 100%\nStatus: COMPLETE\n```\n\nResults are ready. The primary metrics show a **23% improvement** over the baseline. I've flagged three areas that warrant attention — want me to drill down on any of them?",
  "I've cross-referenced your query against the knowledge base. Here's a summary:\n\n1. **Primary finding**: The data confirms your hypothesis.\n2. **Confidence level**: 94.2%\n3. **Recommended action**: Proceed with phase 2\n\nI can generate a full report if needed.",
  "Task received and queued. I'll begin execution immediately.\n\nEstimated completion: **~3 minutes**\n\nI'll notify you when it's done. In the meantime, is there anything else you'd like me to work on?",
  "Here's my analysis:\n\n> The most efficient approach is to parallelize the workload across multiple agents. This reduces total processing time from **18 minutes to approximately 4 minutes**.\n\nWould you like me to spin up the required agents?",
];

export function getRandomDemoResponse(): string {
  return DEMO_RESPONSES[Math.floor(Math.random() * DEMO_RESPONSES.length)];
}

// ─── Usage & costs ────────────────────────────────────────────────────────────

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 30 days of per-day token usage ending today. Deterministic wobble derived
 * from the date so the chart looks organic but stays stable across reloads;
 * weekends dip to roughly a third of weekday volume.
 */
export const DEMO_USAGE_DAILY: UsageDaily[] = (() => {
  const items: UsageDaily[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dow = d.getDay();
    const isWeekend = dow === 0 || dow === 6;
    // Pseudo-random factor in [0.75, 1.25) seeded by the calendar date
    const seed = d.getDate() * 31 + (d.getMonth() + 1) * 7;
    const wobble = 0.75 + (((seed * 9301 + 49297) % 233280) / 233280) * 0.5;
    const total = Math.round((isWeekend ? 16_000 : 50_000) * wobble);
    const input = Math.round(total * 0.62);
    items.push({
      date: isoDay(d),
      input_tokens: input,
      output_tokens: total - input,
      cost_usd: Math.round(total * 7.04e-4) / 100, // ≈ $7.04 per 1M tokens blended
    });
  }
  return items;
})();

const USAGE_30D_TOTALS = DEMO_USAGE_DAILY.reduce(
  (acc, d) => ({
    input: acc.input + d.input_tokens,
    output: acc.output + d.output_tokens,
    cost: acc.cost + d.cost_usd,
  }),
  { input: 0, output: 0, cost: 0 }
);

// ~1.24M tokens / ~$8.73 against a 5M monthly quota
export const DEMO_USAGE_SUMMARY: UsageSummary = {
  input_tokens: USAGE_30D_TOTALS.input,
  output_tokens: USAGE_30D_TOTALS.output,
  total_tokens: USAGE_30D_TOTALS.input + USAGE_30D_TOTALS.output,
  cost_usd: Math.round(USAGE_30D_TOTALS.cost * 100) / 100,
  quota: 5_000_000,
  quota_used_pct:
    Math.round(((USAGE_30D_TOTALS.input + USAGE_30D_TOTALS.output) / 5_000_000) * 1000) / 10,
};

export const DEMO_USAGE_BY_MODEL: UsageByModel[] = [
  { model: "claude-sonnet-4-6", provider: "anthropic", total_tokens: 842_300, cost_usd: 6.21, requests: 512 },
  { model: "claude-opus-4-5", provider: "anthropic", total_tokens: 96_400, cost_usd: 1.42, requests: 38 },
  { model: "claude-haiku-4-5", provider: "anthropic", total_tokens: 214_800, cost_usd: 0.64, requests: 301 },
  { model: "groq/llama-3.3-70b", provider: "groq", total_tokens: 86_500, cost_usd: 0.46, requests: 97 },
];

// Reuses the real demo conversation ids/titles so links resolve in demo mode
export const DEMO_TOP_CONVERSATIONS: TopConversationUsage[] = [
  { conversation_id: "conv-003", title: "Avengers Mission Debrief", total_tokens: 186_400, cost_usd: 1.41 },
  { conversation_id: "conv-001", title: "Arc Reactor Efficiency Analysis", total_tokens: 124_900, cost_usd: 0.97 },
  { conversation_id: "conv-004", title: "Python Code Review", total_tokens: 98_200, cost_usd: 0.72 },
  { conversation_id: "conv-002", title: "Project IRON MAN Status", total_tokens: 61_400, cost_usd: 0.44 },
];

// ─── Audit log ────────────────────────────────────────────────────────────────
// ~2 weeks of activity across every action prefix. Mostly the demo user;
// a few rows from other users so the admin view has variety.
export const DEMO_AUDIT_LOGS: AuditLog[] = [
  { id: "aud-034", user_id: "demo-user-001", action: "auth.login", resource_type: "session", resource_id: null, detail: { method: "password" }, ip: "10.0.0.42", created_at: "2026-07-07T08:02:00Z" },
  { id: "aud-033", user_id: "demo-user-001", action: "workflow.run", resource_type: "workflow", resource_id: "wf-001", detail: { name: "Morning Briefing", run_id: "run-001", duration_ms: 1946 }, ip: "10.0.0.42", created_at: "2026-07-06T08:00:02Z" },
  { id: "aud-032", user_id: "ws-user-003", action: "workspace.share_conversation", resource_type: "workspace", resource_id: "ws-001", detail: { conversation_id: "conv-001" }, ip: "10.0.0.87", created_at: "2026-07-05T22:44:00Z" },
  { id: "aud-031", user_id: "demo-user-001", action: "integration.test", resource_type: "integration", resource_id: "int-001", detail: { provider: "github", status: "connected" }, ip: "10.0.0.42", created_at: "2026-07-05T18:30:00Z" },
  { id: "aud-030", user_id: "demo-user-001", action: "apikey.create", resource_type: "apikey", resource_id: "key-001", detail: { name: "Home Automation Hub" }, ip: "10.0.0.42", created_at: "2026-07-05T21:10:00Z" },
  { id: "aud-029", user_id: "demo-user-001", action: "document.search", resource_type: "document", resource_id: null, detail: { query: "Mark 85 power budget", results: 3 }, ip: "10.0.0.42", created_at: "2026-07-05T16:22:00Z" },
  { id: "aud-028", user_id: "demo-user-001", action: "auth.logout", resource_type: "session", resource_id: null, detail: null, ip: "10.0.0.42", created_at: "2026-07-04T23:41:00Z" },
  { id: "aud-027", user_id: "demo-user-001", action: "workflow.run", resource_type: "workflow", resource_id: "wf-002", detail: { name: "Code Review Pipeline", run_id: "run-002", issues_found: 2 }, ip: "10.0.0.42", created_at: "2026-07-04T16:08:00Z" },
  { id: "aud-026", user_id: "demo-user-001", action: "integration.action", resource_type: "integration", resource_id: "int-001", detail: { action: "summarize_pr", repo: "aqkprogrammer/jarvis", number: 48 }, ip: "10.0.0.42", created_at: "2026-07-04T15:25:00Z" },
  { id: "aud-025", user_id: "demo-user-001", action: "auth.login", resource_type: "session", resource_id: null, detail: { method: "password" }, ip: "10.0.0.42", created_at: "2026-07-04T08:15:00Z" },
  { id: "aud-024", user_id: "ws-user-002", action: "workspace.invite", resource_type: "workspace", resource_id: "ws-001", detail: { email: "rhodey@stark.io", role: "member" }, ip: "10.0.0.61", created_at: "2026-07-03T12:00:00Z" },
  { id: "aud-023", user_id: "demo-user-001", action: "schedule.run_now", resource_type: "schedule", resource_id: "sched-002", detail: { name: "Weekday Standup Summary" }, ip: "10.0.0.42", created_at: "2026-07-03T09:01:00Z" },
  { id: "aud-022", user_id: "demo-user-001", action: "document.upload", resource_type: "document", resource_id: "doc-003", detail: { filename: "research_paper.pdf", size_bytes: 5_912_004 }, ip: "10.0.0.42", created_at: "2026-07-02T10:28:00Z" },
  { id: "aud-021", user_id: "demo-user-001", action: "workflow.update", resource_type: "workflow", resource_id: "wf-002", detail: { name: "Code Review Pipeline", changed: ["nodes", "edges"] }, ip: "10.0.0.42", created_at: "2026-07-02T16:10:00Z" },
  { id: "aud-020", user_id: "demo-user-001", action: "integration.connect", resource_type: "integration", resource_id: "int-002", detail: { provider: "slack", name: "Team Slack" }, ip: "10.0.0.42", created_at: "2026-07-01T14:02:00Z" },
  { id: "aud-019", user_id: "demo-user-001", action: "auth.login", resource_type: "session", resource_id: null, detail: { method: "password" }, ip: "192.168.1.7", created_at: "2026-07-01T07:58:00Z" },
  { id: "aud-018", user_id: "demo-user-001", action: "schedule.toggle", resource_type: "schedule", resource_id: "sched-003", detail: { name: "Hourly System Check", is_active: false }, ip: "10.0.0.42", created_at: "2026-06-30T22:06:00Z" },
  { id: "aud-017", user_id: "demo-user-001", action: "apikey.revoke", resource_type: "apikey", resource_id: "key-002", detail: { name: "Legacy CLI Token" }, ip: "10.0.0.42", created_at: "2026-06-30T11:34:00Z" },
  { id: "aud-016", user_id: "ws-user-003", action: "auth.login", resource_type: "session", resource_id: null, detail: { method: "password" }, ip: "10.0.0.87", created_at: "2026-06-30T09:12:00Z" },
  { id: "aud-015", user_id: "demo-user-001", action: "workspace.member_role", resource_type: "workspace", resource_id: "ws-001", detail: { user_id: "ws-user-002", role: "admin" }, ip: "10.0.0.42", created_at: "2026-06-29T17:20:00Z" },
  { id: "aud-014", user_id: "demo-user-001", action: "document.delete", resource_type: "document", resource_id: "doc-009", detail: { filename: "old_specs_draft.docx" }, ip: "10.0.0.42", created_at: "2026-06-29T15:04:00Z" },
  { id: "aud-013", user_id: "demo-user-001", action: "workflow.create", resource_type: "workflow", resource_id: "wf-002", detail: { name: "Code Review Pipeline", nodes: 4 }, ip: "10.0.0.42", created_at: "2026-06-28T14:20:00Z" },
  { id: "aud-012", user_id: "demo-user-001", action: "auth.login_failed", resource_type: "session", resource_id: null, detail: { reason: "invalid_password", attempts: 1 }, ip: "203.0.113.9", created_at: "2026-06-28T03:17:00Z" },
  { id: "aud-011", user_id: "demo-user-001", action: "schedule.create", resource_type: "schedule", resource_id: "sched-003", detail: { name: "Hourly System Check", cron: "0 * * * *" }, ip: "10.0.0.42", created_at: "2026-06-27T09:00:00Z" },
  { id: "aud-010", user_id: "demo-user-001", action: "document.upload", resource_type: "document", resource_id: "doc-002", detail: { filename: "meeting_notes.md", size_bytes: 18_764 }, ip: "10.0.0.42", created_at: "2026-06-27T14:30:00Z" },
  { id: "aud-009", user_id: "demo-user-001", action: "integration.connect", resource_type: "integration", resource_id: "int-001", detail: { provider: "github", name: "Personal GitHub" }, ip: "10.0.0.42", created_at: "2026-06-26T09:01:00Z" },
  { id: "aud-008", user_id: "ws-user-004", action: "workspace.join", resource_type: "workspace", resource_id: "ws-001", detail: { via: "invite" }, ip: "10.0.0.93", created_at: "2026-06-26T14:05:00Z" },
  { id: "aud-007", user_id: "demo-user-001", action: "workspace.create", resource_type: "workspace", resource_id: "ws-001", detail: { name: "JARVIS Team" }, ip: "10.0.0.42", created_at: "2026-06-25T09:00:00Z" },
  { id: "aud-006", user_id: "demo-user-001", action: "schedule.update", resource_type: "schedule", resource_id: "sched-001", detail: { name: "Daily Morning Briefing", cron: "0 8 * * *" }, ip: "10.0.0.42", created_at: "2026-06-25T08:32:00Z" },
  { id: "aud-005", user_id: "demo-user-001", action: "document.upload", resource_type: "document", resource_id: "doc-001", detail: { filename: "Q3_report.pdf", size_bytes: 2_483_112 }, ip: "10.0.0.42", created_at: "2026-06-24T09:15:00Z" },
  { id: "aud-004", user_id: "demo-user-001", action: "workflow.create", resource_type: "workflow", resource_id: "wf-001", detail: { name: "Morning Briefing", nodes: 3 }, ip: "10.0.0.42", created_at: "2026-06-24T08:00:00Z" },
  { id: "aud-003", user_id: "demo-user-001", action: "apikey.create", resource_type: "apikey", resource_id: "key-002", detail: { name: "Legacy CLI Token" }, ip: "192.168.1.7", created_at: "2026-06-23T09:00:00Z" },
  { id: "aud-002", user_id: "demo-user-001", action: "auth.login", resource_type: "session", resource_id: null, detail: { method: "password" }, ip: "10.0.0.42", created_at: "2026-06-23T08:44:00Z" },
  { id: "aud-001", user_id: "demo-user-001", action: "schedule.create", resource_type: "schedule", resource_id: "sched-001", detail: { name: "Daily Morning Briefing", cron: "0 8 * * *" }, ip: "10.0.0.42", created_at: "2026-06-23T08:30:00Z" },
];

// ─── Admin ────────────────────────────────────────────────────────────────────

// Platform-wide daily usage ≈ 3.9× the demo user's own curve
export const DEMO_ADMIN_USAGE_DAILY: UsageDaily[] = DEMO_USAGE_DAILY.map((d) => ({
  date: d.date,
  input_tokens: Math.round(d.input_tokens * 3.9),
  output_tokens: Math.round(d.output_tokens * 3.9),
  cost_usd: Math.round(d.cost_usd * 3.9 * 100) / 100,
}));

const ADMIN_30D_TOTALS = DEMO_ADMIN_USAGE_DAILY.reduce(
  (acc, d) => ({ tokens: acc.tokens + d.input_tokens + d.output_tokens, cost: acc.cost + d.cost_usd }),
  { tokens: 0, cost: 0 }
);

export const DEMO_ADMIN_STATS: AdminStats = {
  users: { total: 5, active: 4 },
  conversations: 147,
  messages: 3_214,
  documents: 23,
  workflows: 9,
  schedules: { total: 11, active: 7 },
  tokens_30d: ADMIN_30D_TOTALS.tokens,
  cost_30d: Math.round(ADMIN_30D_TOTALS.cost * 100) / 100,
};

export const DEMO_ADMIN_USERS: AdminUser[] = [
  {
    id: DEMO_USER.id,
    email: DEMO_USER.email,
    username: DEMO_USER.username,
    is_active: true,
    is_admin: true,
    monthly_token_quota: 5_000_000,
    created_at: "2025-01-01T00:00:00Z",
    conversation_count: 38,
    tokens_30d: DEMO_USAGE_SUMMARY.total_tokens,
    cost_30d: DEMO_USAGE_SUMMARY.cost_usd,
  },
  {
    id: "ws-user-002",
    email: "tony@stark.io",
    username: "tony",
    is_active: true,
    is_admin: true,
    monthly_token_quota: null,
    created_at: "2025-02-14T00:00:00Z",
    conversation_count: 52,
    tokens_30d: 1_872_400,
    cost_30d: 13.18,
  },
  {
    id: "ws-user-003",
    email: "pepper@stark.io",
    username: "pepper",
    is_active: true,
    is_admin: false,
    monthly_token_quota: 2_000_000,
    created_at: "2025-03-02T00:00:00Z",
    conversation_count: 34,
    tokens_30d: 1_214_800,
    cost_30d: 8.55,
  },
  {
    id: "ws-user-004",
    email: "happy@stark.io",
    username: "happy",
    is_active: true,
    is_admin: false,
    monthly_token_quota: 1_000_000,
    created_at: "2025-05-19T00:00:00Z",
    conversation_count: 19,
    tokens_30d: 486_200,
    cost_30d: 3.41,
  },
  {
    id: "usr-005",
    email: "justin@hammer.io",
    username: "jhammer",
    is_active: false,
    is_admin: false,
    monthly_token_quota: 500_000,
    created_at: "2025-08-30T00:00:00Z",
    conversation_count: 4,
    tokens_30d: 0,
    cost_30d: 0,
  },
];
