import type {
  User,
  ConversationSummary,
  Message,
  Memory,
  Task,
  Agent,
  Document,
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
