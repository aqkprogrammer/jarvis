// ==================== USER TYPES ====================
export interface User {
  id: string;
  email: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
  preferences: UserPreferences;
}

export interface UserPreferences {
  theme: "dark" | "light" | "system";
  language: string;
  voice_enabled: boolean;
  default_model: string;
  notifications_enabled: boolean;
  auto_speak: boolean;
  push_to_talk: boolean;
}

// ==================== MESSAGE TYPES ====================
export type MessageRole = "user" | "assistant" | "system" | "tool";
export type MessageStatus = "sending" | "streaming" | "complete" | "error";

export type ReasoningStepType = "thinking" | "tool" | "retrieval";

export interface ReasoningStep {
  type: ReasoningStepType;
  label: string;
  detail: string;
}

export interface MessageMeta {
  steps?: ReasoningStep[];
  model?: string;
  provider?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: string;
  status: "pending" | "running" | "complete" | "error";
  started_at?: string;
  completed_at?: string;
}

export interface MessageContent {
  type: "text" | "image" | "tool_use" | "tool_result";
  text?: string;
  image_url?: string;
  tool_call?: ToolCall;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string | MessageContent[];
  tool_calls?: ToolCall[];
  status: MessageStatus;
  model?: string;
  tokens?: {
    input: number;
    output: number;
  };
  created_at: string;
  updated_at?: string;
  metadata?: Record<string, unknown>;
  /** IDs of documents attached to this message (RAG context) */
  document_ids?: string[];
  /** Resolved attachments for display (filename chips on the bubble) */
  attached_documents?: Array<{ id: string; filename: string }>;
  /** Reasoning trace + model info for assistant messages */
  meta?: MessageMeta;
}

// ==================== CONVERSATION TYPES ====================
export interface Conversation {
  id: string;
  title: string;
  user_id: string;
  model: string;
  system_prompt?: string;
  messages: Message[];
  message_count: number;
  token_count: number;
  created_at: string;
  updated_at: string;
  archived: boolean;
  pinned: boolean;
  tags: string[];
  metadata?: Record<string, unknown>;
}

export interface ConversationSummary {
  id: string;
  title: string;
  model: string;
  message_count: number;
  token_count: number;
  last_message?: string;
  last_message_at: string;
  created_at: string;
  archived: boolean;
  pinned: boolean;
  tags: string[];
}

// ==================== MEMORY TYPES ====================
export type MemoryType = "fact" | "preference" | "event" | "skill" | "context";
export type ImportanceLevel = 1 | 2 | 3 | 4 | 5;

export interface Memory {
  id: string;
  user_id: string;
  type: MemoryType;
  content: string;
  summary?: string;
  importance: ImportanceLevel;
  tags: string[];
  source_conversation_id?: string;
  source_message_id?: string;
  embedding_id?: string;
  created_at: string;
  updated_at: string;
  last_accessed?: string;
  access_count: number;
  metadata?: Record<string, unknown>;
}

export interface MemorySearchResult {
  memory: Memory;
  score: number;
  highlights?: string[];
}

// ==================== DOCUMENT TYPES (RAG) ====================
export type DocumentStatus = "processing" | "ready" | "failed";

export interface Document {
  id: string;
  user_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  status: DocumentStatus;
  error?: string;
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentSearchResult {
  content: string;
  document_id: string;
  filename: string;
  score: number;
}

// ==================== CODE EXECUTION TYPES ====================
export interface ExecuteResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
  truncated: boolean;
}

// ==================== ARTIFACT TYPES ====================
export type ArtifactType = "html" | "svg" | "markdown" | "code";

export interface Artifact {
  type: ArtifactType;
  title: string;
  content: string;
  language?: string;
}

// ==================== TASK TYPES ====================
export type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled" | "paused";
export type TaskPriority = "low" | "medium" | "high" | "critical";

export interface TaskStep {
  id: string;
  description: string;
  status: TaskStatus;
  output?: string;
  error?: string;
  started_at?: string;
  completed_at?: string;
}

export interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  progress: number;
  steps: TaskStep[];
  agent_id?: string;
  conversation_id?: string;
  tags: string[];
  due_date?: string;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
  error?: string;
  result?: string;
  metadata?: Record<string, unknown>;
}

// ==================== AGENT TYPES ====================
export type AgentStatus = "idle" | "running" | "paused" | "error" | "offline";

export interface Agent {
  id: string;
  name: string;
  type: string;
  description: string;
  status: AgentStatus;
  capabilities: string[];
  current_task_id?: string;
  tasks_completed: number;
  tasks_failed: number;
  uptime_seconds: number;
  last_active?: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

// ==================== API RESPONSE TYPES ====================
export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface ApiError {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
  status: number;
}

// ==================== WEBSOCKET EVENT TYPES ====================
export type WSEventType =
  | "message.chunk"
  | "message.complete"
  | "message.error"
  | "tool.start"
  | "tool.complete"
  | "tool.error"
  | "task.update"
  | "task.complete"
  | "task.error"
  | "agent.status"
  | "notification"
  | "ping"
  | "pong";

export interface WSEvent {
  type: WSEventType;
  data: unknown;
  timestamp: string;
  conversation_id?: string;
  message_id?: string;
  task_id?: string;
  agent_id?: string;
}

export interface MessageChunkEvent {
  conversation_id: string;
  message_id: string;
  chunk: string;
  index: number;
}

export interface MessageCompleteEvent {
  conversation_id: string;
  message_id: string;
  message: Message;
}

export interface TaskUpdateEvent {
  task_id: string;
  status: TaskStatus;
  progress: number;
  step?: TaskStep;
  message?: string;
}

// ==================== ANALYTICS TYPES ====================
export interface UsageStats {
  total_messages: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  total_conversations: number;
  total_memories: number;
  total_tasks: number;
  tasks_completed: number;
  tasks_failed: number;
  period_start: string;
  period_end: string;
}

export interface DailyUsage {
  date: string;
  messages: number;
  tokens: number;
  conversations: number;
}

export interface ModelUsage {
  model: string;
  messages: number;
  tokens: number;
  percentage: number;
}

// ==================== NOTIFICATION TYPES ====================
export type NotificationType = "info" | "success" | "warning" | "error";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  action_url?: string;
  created_at: string;
}

// ==================== VOICE TYPES ====================
export type VoiceState = "idle" | "listening" | "processing" | "speaking" | "error";

export interface VoiceSession {
  id: string;
  state: VoiceState;
  transcript?: string;
  confidence?: number;
  audio_url?: string;
  duration?: number;
}

// ==================== STREAMING TYPES ====================
export interface StreamingState {
  isStreaming: boolean;
  conversationId?: string;
  messageId?: string;
  content: string;
  toolCalls: ToolCall[];
}

// ==================== WORKFLOW TYPES ====================
export type WorkflowNodeType = "trigger" | "agent" | "condition" | "output";
export type ConditionOp = "contains" | "not_contains" | "equals";

export interface WorkflowNodeCondition {
  field: "output";
  op: ConditionOp;
  value: string;
}

export interface WorkflowNodeData {
  label: string;
  agent_type?: string;
  prompt?: string;
  condition?: WorkflowNodeCondition;
}

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  position: { x: number; y: number };
  data: WorkflowNodeData;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

export interface Workflow {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type WorkflowRunStatus = "running" | "completed" | "failed";
export type NodeResultStatus = "completed" | "failed" | "skipped";

export interface NodeResult {
  status: NodeResultStatus;
  output?: string;
  error?: string;
  duration_ms?: number;
}

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  status: WorkflowRunStatus;
  node_results: Record<string, NodeResult>;
  error?: string;
  started_at: string;
  finished_at?: string;
}

// ==================== SCHEDULE TYPES ====================
export type ScheduleTargetType = "workflow" | "prompt";

export interface Schedule {
  id: string;
  user_id: string;
  name: string;
  cron: string;
  target_type: ScheduleTargetType;
  workflow_id?: string;
  prompt?: string;
  is_active: boolean;
  last_run_at?: string;
  next_run_at?: string;
  last_status?: string;
  created_at: string;
  updated_at: string;
}

// ==================== API KEY TYPES ====================
export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  last_used_at?: string;
  revoked: boolean;
  created_at: string;
}

/** Returned only by the create endpoint — `key` is shown exactly once. */
export interface ApiKeyCreated {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  key: string;
}

// ==================== INTEGRATION TYPES ====================
export type IntegrationProvider = "github" | "slack" | "discord" | "notion";

export interface Integration {
  id: string;
  user_id: string;
  provider: IntegrationProvider;
  name: string;
  /** Credentials are write-only — the API only reports whether they exist. */
  has_credentials: boolean;
  config: Record<string, unknown>;
  status: "connected" | "error";
  last_error?: string;
  created_at: string;
  updated_at: string;
}

export interface GithubRepo {
  full_name: string;
  description: string | null;
  stars: number;
  updated_at: string;
}

export interface GithubPR {
  number: number;
  title: string;
  user: string;
  created_at: string;
}

export interface PRSummary {
  summary: string;
  title: string;
  number: number;
  files_changed: number;
}

// ==================== WEBHOOK TYPES ====================
export interface WebhookTrigger {
  id: string;
  user_id: string;
  name: string;
  token: string;
  workflow_id: string;
  url: string;
  is_active: boolean;
  trigger_count: number;
  last_triggered_at?: string;
  created_at: string;
}

export type WebhookEvent =
  | "workflow.completed"
  | "workflow.failed"
  | "schedule.completed"
  | "task.completed";

export interface OutgoingWebhook {
  id: string;
  user_id: string;
  name: string;
  url: string;
  events: WebhookEvent[];
  secret?: string | null;
  is_active: boolean;
  last_status?: string;
  created_at: string;
}
