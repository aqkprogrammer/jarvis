"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { useUIStore } from "@/stores/uiStore";
import { Notification, NotificationType } from "@/types";

const icons: Record<NotificationType, React.ReactNode> = {
  success: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
  error: <AlertCircle className="w-4 h-4 text-red-400" />,
  warning: <AlertTriangle className="w-4 h-4 text-amber-400" />,
  info: <Info className="w-4 h-4 text-primary" />,
};

const borderColors: Record<NotificationType, string> = {
  success: "border-emerald-500/30",
  error: "border-red-500/30",
  warning: "border-amber-500/30",
  info: "border-primary/30",
};

function ToastItem({ notification, onRemove }: { notification: Notification; onRemove: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onRemove(notification.id), 5000);
    return () => clearTimeout(timer);
  }, [notification.id, onRemove]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 100, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.9 }}
      className={`glass rounded-xl p-4 border ${borderColors[notification.type]} shadow-jarvis-sm max-w-sm w-full`}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">{icons[notification.type]}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-jarvis-text font-mono">{notification.title}</p>
          <p className="text-xs text-jarvis-text-muted mt-0.5 break-words">{notification.message}</p>
        </div>
        <button
          onClick={() => onRemove(notification.id)}
          className="shrink-0 text-jarvis-text-muted hover:text-jarvis-text transition-colors ml-2"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}

export function Toast() {
  const { notifications, removeNotification } = useUIStore();
  const recentNotifications = notifications.filter((n) => !n.read).slice(0, 5);

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence mode="sync">
        {recentNotifications.map((notification) => (
          <div key={notification.id} className="pointer-events-auto">
            <ToastItem notification={notification} onRemove={removeNotification} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
