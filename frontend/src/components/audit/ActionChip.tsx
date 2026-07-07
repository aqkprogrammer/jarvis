import { cn } from "@/components/ui/button";

// Color keyed by the action prefix (segment before the first dot)
const PREFIX_STYLES: Record<string, string> = {
  auth: "bg-cyan-500/10 border-cyan-500/30 text-cyan-400",
  document: "bg-violet-500/10 border-violet-500/30 text-violet-400",
  workflow: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
  schedule: "bg-teal-500/10 border-teal-500/30 text-teal-400",
  apikey: "bg-amber-500/10 border-amber-500/30 text-amber-400",
  integration: "bg-blue-500/10 border-blue-500/30 text-blue-400",
  workspace: "bg-pink-500/10 border-pink-500/30 text-pink-400",
};

const FALLBACK_STYLE = "bg-gray-500/10 border-gray-500/30 text-gray-400";

export function ActionChip({ action }: { action: string }) {
  const prefix = action.split(".")[0];
  return (
    <span
      className={cn(
        "inline-flex px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider border whitespace-nowrap",
        PREFIX_STYLES[prefix] ?? FALLBACK_STYLE
      )}
    >
      {action}
    </span>
  );
}
