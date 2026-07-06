'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  User,
  Key,
  Bell,
  Mic,
  Volume2,
  Brain,
  Shield,
  Palette,
  Cpu,
  Save,
  Eye,
  EyeOff,
  ChevronRight,
  Plus,
  Copy,
  Check,
  Trash2,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { getApi } from '@/lib/api';
import type { ApiKey, ApiKeyCreated } from '@/types';

const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'ai', label: 'AI Providers', icon: Cpu },
  { id: 'apikeys', label: 'API Keys', icon: Key },
  { id: 'voice', label: 'Voice', icon: Mic },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'appearance', label: 'Appearance', icon: Palette },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

interface ApiKeyFieldProps {
  label: string;
  placeholder: string;
  envKey: string;
}

function ApiKeyField({ label, placeholder, envKey }: ApiKeyFieldProps) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState('');

  return (
    <div className="space-y-1.5">
      <label className="text-sm text-slate-400">{label}</label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={visible ? 'text' : 'password'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/60 pr-10"
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
          >
            {visible ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-600">Env var: {envKey}</p>
    </div>
  );
}

function ProfileSection() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-2xl font-bold text-white">
          J
        </div>
        <div>
          <button className="text-sm text-cyan-400 hover:text-cyan-300">Change avatar</button>
          <p className="text-xs text-slate-500 mt-0.5">JPG, PNG or GIF, max 2MB</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {[
          { label: 'Display name', placeholder: 'Tony Stark' },
          { label: 'Username', placeholder: 'jarvis_admin' },
        ].map(({ label, placeholder }) => (
          <div key={label} className="space-y-1.5">
            <label className="text-sm text-slate-400">{label}</label>
            <input
              placeholder={placeholder}
              className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/60"
            />
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        <label className="text-sm text-slate-400">Email</label>
        <input
          type="email"
          placeholder="tony@stark.com"
          className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/60"
        />
      </div>
    </div>
  );
}

function AIProvidersSection() {
  const [defaultProvider, setDefaultProvider] = useState('anthropic');

  const providers = [
    { id: 'anthropic', name: 'Anthropic', model: 'claude-sonnet-4-6' },
    { id: 'openai', name: 'OpenAI', model: 'gpt-4o' },
    { id: 'groq', name: 'Groq', model: 'llama-3.3-70b-versatile' },
    { id: 'google', name: 'Google', model: 'gemini-2.0-flash' },
    { id: 'ollama', name: 'Ollama (local)', model: 'llama3.2' },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="text-sm text-slate-400">Default Provider</label>
        <div className="grid grid-cols-2 gap-2">
          {providers.map((p) => (
            <button
              key={p.id}
              onClick={() => setDefaultProvider(p.id)}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm transition-all ${
                defaultProvider === p.id
                  ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-300'
                  : 'border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-600'
              }`}
            >
              <span>{p.name}</span>
              <span className="text-xs opacity-60">{p.model}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4 pt-2 border-t border-slate-800">
        <p className="text-sm font-medium text-slate-300">API Keys</p>
        <ApiKeyField label="Anthropic" placeholder="sk-ant-..." envKey="ANTHROPIC_API_KEY" />
        <ApiKeyField label="OpenAI" placeholder="sk-..." envKey="OPENAI_API_KEY" />
        <ApiKeyField label="Groq" placeholder="gsk_..." envKey="GROQ_API_KEY" />
        <ApiKeyField label="Google AI" placeholder="AIza..." envKey="GOOGLE_API_KEY" />
        <ApiKeyField label="ElevenLabs" placeholder="..." envKey="ELEVENLABS_API_KEY" />
      </div>

      <div className="space-y-3 pt-2 border-t border-slate-800">
        <p className="text-sm font-medium text-slate-300">Generation Settings</p>
        {[
          { label: 'Temperature', min: 0, max: 2, step: 0.1, defaultVal: 0.7 },
          { label: 'Max Tokens', min: 256, max: 8192, step: 256, defaultVal: 2048 },
        ].map(({ label, min, max, step, defaultVal }) => (
          <div key={label} className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">{label}</span>
              <span className="text-cyan-400">{defaultVal}</span>
            </div>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              defaultValue={defaultVal}
              className="w-full accent-cyan-500"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function VoiceSection() {
  const [sttProvider, setSttProvider] = useState('groq');
  const [ttsProvider, setTtsProvider] = useState('elevenlabs');
  const [wakeWord, setWakeWord] = useState(true);
  const [continuousMode, setContinuousMode] = useState(false);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-sm text-slate-400">Speech-to-Text</label>
          {['groq', 'whisper', 'assemblyai', 'deepgram'].map((p) => (
            <button
              key={p}
              onClick={() => setSttProvider(p)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                sttProvider === p
                  ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-300'
                  : 'border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-600'
              }`}
            >
              <Mic size={14} />
              <span className="capitalize">{p === 'groq' ? 'Groq Whisper' : p === 'assemblyai' ? 'AssemblyAI' : p.charAt(0).toUpperCase() + p.slice(1)}</span>
            </button>
          ))}
        </div>
        <div className="space-y-2">
          <label className="text-sm text-slate-400">Text-to-Speech</label>
          {['elevenlabs', 'openai', 'piper'].map((p) => (
            <button
              key={p}
              onClick={() => setTtsProvider(p)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                ttsProvider === p
                  ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-300'
                  : 'border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-600'
              }`}
            >
              <Volume2 size={14} />
              <span className="capitalize">{p === 'elevenlabs' ? 'ElevenLabs' : p === 'openai' ? 'OpenAI TTS' : 'Piper (offline)'}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 pt-2 border-t border-slate-800">
        <p className="text-sm font-medium text-slate-300">Listening Modes</p>
        {[
          { label: 'Wake Word Detection', sublabel: '"Hey JARVIS" or "JARVIS"', value: wakeWord, set: setWakeWord },
          { label: 'Continuous Listening', sublabel: 'Always-on microphone mode', value: continuousMode, set: setContinuousMode },
        ].map(({ label, sublabel, value, set }) => (
          <div key={label} className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm text-slate-200">{label}</p>
              <p className="text-xs text-slate-500">{sublabel}</p>
            </div>
            <button
              onClick={() => set(!value)}
              className={`w-11 h-6 rounded-full transition-colors ${value ? 'bg-cyan-500' : 'bg-slate-700'}`}
            >
              <span
                className={`block w-4 h-4 bg-white rounded-full mx-1 transition-transform ${value ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </div>
        ))}
      </div>

      <div className="space-y-1.5 pt-2 border-t border-slate-800">
        <label className="text-sm text-slate-400">Voice Speed</label>
        <input type="range" min={0.5} max={2} step={0.1} defaultValue={1} className="w-full accent-cyan-500" />
        <div className="flex justify-between text-xs text-slate-600">
          <span>0.5×</span><span>1.0× (normal)</span><span>2.0×</span>
        </div>
      </div>
    </div>
  );
}

interface ToggleItemProps {
  label: string;
  sublabel: string;
  defaultOn: boolean;
}

function ToggleItem({ label, sublabel, defaultOn }: ToggleItemProps) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div className="flex items-center justify-between py-1">
      <div>
        <p className="text-sm text-slate-200">{label}</p>
        <p className="text-xs text-slate-500">{sublabel}</p>
      </div>
      <button onClick={() => setOn(!on)} className={`w-11 h-6 rounded-full transition-colors ${on ? 'bg-cyan-500' : 'bg-slate-700'}`}>
        <span className={`block w-4 h-4 bg-white rounded-full mx-1 transition-transform ${on ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}

interface SimpleToggleProps {
  label: string;
  defaultOn: boolean;
}

function SimpleToggle({ label, defaultOn }: SimpleToggleProps) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div className="flex items-center justify-between py-1">
      <p className="text-sm text-slate-200">{label}</p>
      <button onClick={() => setOn(!on)} className={`w-11 h-6 rounded-full transition-colors ${on ? 'bg-cyan-500' : 'bg-slate-700'}`}>
        <span className={`block w-4 h-4 bg-white rounded-full mx-1 transition-transform ${on ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}

function MemorySection() {
  return (
    <div className="space-y-5">
      <ToggleItem label="Auto-extract memories" sublabel="Automatically identify and store facts from conversations" defaultOn={true} />
      <ToggleItem label="Long-term memory" sublabel="Persist memories across sessions" defaultOn={true} />
      <ToggleItem label="Memory importance scoring" sublabel="Rank memories by relevance and recency" defaultOn={true} />
      <ToggleItem label="Forgetting curve" sublabel="Gradually decay low-importance memories" defaultOn={false} />
      <ToggleItem label="Memory consolidation" sublabel="Merge similar memories daily" defaultOn={true} />
      <div className="pt-3 border-t border-slate-800 space-y-1.5">
        <label className="text-sm text-slate-400">Max memory context tokens</label>
        <input type="range" min={500} max={4000} step={100} defaultValue={1500} className="w-full accent-cyan-500" />
        <div className="flex justify-between text-xs text-slate-600"><span>500</span><span>1500 (default)</span><span>4000</span></div>
      </div>
    </div>
  );
}

function NotificationsSection() {
  return (
    <div className="space-y-4">
      <ToggleItem label="Task completions" sublabel="Notify when an agent finishes a task" defaultOn={true} />
      <ToggleItem label="Memory milestones" sublabel="Alert when memory capacity is near limit" defaultOn={true} />
      <ToggleItem label="System alerts" sublabel="Critical errors and warnings" defaultOn={true} />
      <ToggleItem label="Daily digest" sublabel="Morning summary of tasks and memory" defaultOn={true} />
    </div>
  );
}

function SecuritySection() {
  return (
    <div className="space-y-5">
      <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
        <div className="flex items-center gap-2 text-amber-400 text-sm font-medium mb-1">
          <Shield size={14} /> Dangerous Action Protection
        </div>
        <p className="text-xs text-amber-400/70">
          JARVIS will always ask for confirmation before executing system-level operations, file deletions, or browser form submissions.
        </p>
      </div>
      <SimpleToggle label="Require confirmation for system commands" defaultOn={true} />
      <SimpleToggle label="Require confirmation for file deletion" defaultOn={true} />
      <SimpleToggle label="Require confirmation for browser form submit" defaultOn={true} />
      <SimpleToggle label="Audit logging" defaultOn={true} />
      <SimpleToggle label="Secret scanning in responses" defaultOn={true} />
      <div className="pt-3 border-t border-slate-800">
        <button className="w-full py-2 rounded-lg border border-red-500/40 text-red-400 text-sm hover:bg-red-500/10 transition-colors">
          Revoke all active sessions
        </button>
      </div>
    </div>
  );
}

function AppearanceSection() {
  const [accent, setAccent] = useState('#00D4FF');
  const accents = ['#00D4FF', '#7C3AED', '#10B981', '#F59E0B', '#EF4444'];

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label className="text-sm text-slate-400">Accent Color</label>
        <div className="flex gap-3">
          {accents.map((c) => (
            <button
              key={c}
              onClick={() => setAccent(c)}
              style={{ backgroundColor: c }}
              className={`w-8 h-8 rounded-full transition-all ${accent === c ? 'ring-2 ring-offset-2 ring-offset-slate-900 ring-white scale-110' : ''}`}
            />
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-sm text-slate-400">Interface Density</label>
        <div className="grid grid-cols-3 gap-2">
          {['Compact', 'Default', 'Comfortable'].map((d) => (
            <button key={d} className="py-2 rounded-lg border border-slate-700 bg-slate-800/40 text-sm text-slate-400 hover:border-cyan-500/60 hover:text-cyan-300 transition-all">
              {d}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <ToggleItem label="Animations" sublabel="Framer Motion transitions" defaultOn={true} />
        <ToggleItem label="HUD scan lines" sublabel="Decorative scan line overlay" defaultOn={false} />
        <ToggleItem label="Glassmorphism" sublabel="Frosted glass card effect" defaultOn={true} />
      </div>
    </div>
  );
}

function ApiKeysSection() {
  const queryClient = useQueryClient();
  const [newKeyName, setNewKeyName] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createdKey, setCreatedKey] = useState<ApiKeyCreated | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ['apikeys'],
    queryFn: async () => {
      const response = await getApi().apikeys.list();
      const data = response.data as { items?: ApiKey[]; data?: ApiKey[] } | ApiKey[];
      const items = Array.isArray(data) ? data : data?.items ?? data?.data ?? [];
      return Array.isArray(items) ? items : [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await getApi().apikeys.create(name);
      return response.data as ApiKeyCreated;
    },
    onSuccess: (created) => {
      setCreatedKey(created);
      setNewKeyName('');
      setShowCreate(false);
      setCopied(false);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['apikeys'] });
    },
    onError: (e) => setError((e as Error).message),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => getApi().apikeys.revoke(id),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['apikeys'] });
    },
    onError: (e) => setError((e as Error).message),
  });

  const copyKey = async () => {
    if (!createdKey) return;
    try {
      await navigator.clipboard.writeText(createdKey.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy to clipboard');
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-400">
        Personal keys for calling the JARVIS API from scripts, home automation, or external services.
      </p>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* One-time reveal panel */}
      {createdKey && (
        <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-3">
          <div className="flex items-center gap-2 text-amber-400 text-sm font-medium">
            <AlertTriangle size={14} />
            This key is shown only once — copy it now.
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-700 text-xs font-mono text-cyan-300 break-all">
              {createdKey.key}
            </code>
            <button
              onClick={copyKey}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs hover:bg-cyan-500/20 transition-all shrink-0"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-amber-400/70">
              Key &quot;{createdKey.name}&quot; created. Store it somewhere safe.
            </p>
            <button
              onClick={() => setCreatedKey(null)}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Generate new key */}
      {showCreate ? (
        <div className="flex items-center gap-2">
          <input
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newKeyName.trim()) createMutation.mutate(newKeyName.trim());
              if (e.key === 'Escape') setShowCreate(false);
            }}
            autoFocus
            placeholder="Key name, e.g. Home Automation Hub"
            className="flex-1 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/60"
          />
          <button
            onClick={() => createMutation.mutate(newKeyName.trim())}
            disabled={!newKeyName.trim() || createMutation.isPending}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-sm hover:bg-cyan-500/20 transition-all disabled:opacity-50"
          >
            {createMutation.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Key size={14} />
            )}
            Create
          </button>
          <button
            onClick={() => setShowCreate(false)}
            className="px-3 py-2 rounded-lg border border-slate-700 text-slate-400 text-sm hover:text-slate-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-sm hover:bg-cyan-500/20 transition-all"
        >
          <Plus size={14} />
          Generate new key
        </button>
      )}

      {/* Key list */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-16 rounded-lg bg-slate-800/60 animate-pulse" />
            ))}
          </div>
        ) : keys.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">No API keys yet.</p>
        ) : (
          keys.map((k) => (
            <div
              key={k.id}
              className={`flex items-center gap-3 p-3 rounded-lg border border-slate-800 bg-slate-800/40 ${
                k.revoked ? 'opacity-60' : ''
              }`}
            >
              <div className="p-2 rounded-lg bg-cyan-500/5 border border-cyan-500/20 shrink-0">
                <Key size={14} className="text-cyan-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm text-slate-200 truncate">{k.name}</p>
                  {k.revoked && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider bg-red-500/10 border border-red-500/30 text-red-400 shrink-0">
                      revoked
                    </span>
                  )}
                </div>
                <p className="text-xs font-mono text-slate-500 mt-0.5">
                  {k.key_prefix}
                  <span className="tracking-widest">••••••••</span>
                  <span className="mx-2 text-slate-700">|</span>
                  created {new Date(k.created_at).toLocaleDateString()}
                  <span className="mx-2 text-slate-700">|</span>
                  last used{' '}
                  {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'never'}
                </p>
              </div>
              {!k.revoked && (
                <button
                  onClick={() => {
                    if (confirmingId === k.id) {
                      revokeMutation.mutate(k.id);
                      setConfirmingId(null);
                    } else {
                      setConfirmingId(k.id);
                    }
                  }}
                  onMouseLeave={() => setConfirmingId((id) => (id === k.id ? null : id))}
                  disabled={revokeMutation.isPending && revokeMutation.variables === k.id}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all shrink-0 ${
                    confirmingId === k.id
                      ? 'text-red-400 bg-red-500/10 border border-red-500/40'
                      : 'text-slate-500 border border-slate-700 hover:text-red-400 hover:border-red-500/40'
                  }`}
                >
                  {revokeMutation.isPending && revokeMutation.variables === k.id ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Trash2 size={12} />
                  )}
                  {confirmingId === k.id ? 'Confirm revoke?' : 'Revoke'}
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Usage hint */}
      <div className="pt-3 border-t border-slate-800 space-y-2">
        <p className="text-sm font-medium text-slate-300">Usage</p>
        <p className="text-xs text-slate-500">
          Pass your key in the <code className="text-cyan-400">X-API-Key</code> header:
        </p>
        <pre className="p-3 rounded-lg bg-slate-900/80 border border-slate-700 text-xs font-mono text-slate-300 overflow-x-auto">
          {'curl -H "X-API-Key: jrv_..." http://localhost:8000/api/v1/chat'}
        </pre>
      </div>
    </div>
  );
}

const SECTION_COMPONENTS: Record<SectionId, React.ComponentType> = {
  profile: ProfileSection,
  ai: AIProvidersSection,
  apikeys: ApiKeysSection,
  voice: VoiceSection,
  memory: MemorySection,
  notifications: NotificationsSection,
  security: SecuritySection,
  appearance: AppearanceSection,
};

export default function SettingsPage() {
  const [active, setActive] = useState<SectionId>('profile');
  const ActiveSection = SECTION_COMPONENTS[active];

  return (
    <div className="flex h-full gap-6">
      {/* Sidebar nav */}
      <nav className="w-52 flex-shrink-0 space-y-1">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActive(id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
              active === id
                ? 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-300'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Icon size={15} />
            <span>{label}</span>
            {active === id && <ChevronRight size={13} className="ml-auto" />}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <motion.div
          key={active}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.15 }}
          className="bg-slate-900/60 backdrop-blur border border-slate-800 rounded-xl p-6 h-full overflow-y-auto"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-slate-100">
              {SECTIONS.find((s) => s.id === active)?.label}
            </h2>
            <button className="flex items-center gap-2 px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-cyan-300 text-sm transition-all">
              <Save size={14} />
              Save changes
            </button>
          </div>

          <ActiveSection />
        </motion.div>
      </div>
    </div>
  );
}
