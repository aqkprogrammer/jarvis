import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./button";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-mono font-medium tracking-wider uppercase border transition-all",
  {
    variants: {
      variant: {
        default: "bg-primary/10 border-primary/30 text-primary",
        success: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
        warning: "bg-amber-500/10 border-amber-500/30 text-amber-400",
        danger: "bg-red-500/10 border-red-500/30 text-red-400",
        info: "bg-blue-500/10 border-blue-500/30 text-blue-400",
        muted: "bg-jarvis-surface border-jarvis-border text-jarvis-text-muted",
        running: "bg-primary/10 border-primary/30 text-primary animate-pulse",
        offline: "bg-gray-500/10 border-gray-500/30 text-gray-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

function Badge({ className, variant, dot = false, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && (
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            variant === "success" && "bg-emerald-400",
            variant === "warning" && "bg-amber-400",
            variant === "danger" && "bg-red-400",
            variant === "running" && "bg-primary animate-ping",
            variant === "default" && "bg-primary",
            variant === "offline" && "bg-gray-400",
            variant === "muted" && "bg-jarvis-text-muted",
          )}
        />
      )}
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
