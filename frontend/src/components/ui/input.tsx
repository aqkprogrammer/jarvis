import * as React from "react";
import { cn } from "./button";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerClassName?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, leftIcon, rightIcon, containerClassName, type = "text", ...props }, ref) => {
    return (
      <div className={cn("flex flex-col gap-1.5", containerClassName)}>
        {label && (
          <label className="text-xs font-mono text-jarvis-text-muted uppercase tracking-wider">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-3 flex items-center text-jarvis-text-muted pointer-events-none">
              {leftIcon}
            </div>
          )}
          <input
            type={type}
            ref={ref}
            className={cn(
              "jarvis-input w-full font-mono text-sm",
              !!leftIcon && "pl-10",
              !!rightIcon && "pr-10",
              error && "border-red-500/50 focus:border-red-500/80 focus:ring-red-500/10",
              className
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 flex items-center text-jarvis-text-muted">
              {rightIcon}
            </div>
          )}
        </div>
        {error && (
          <p className="text-xs text-red-400 font-mono flex items-center gap-1">
            <span>⚠</span>
            <span>{error}</span>
          </p>
        )}
        {hint && !error && (
          <p className="text-xs text-jarvis-text-muted font-mono">{hint}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export { Input };
