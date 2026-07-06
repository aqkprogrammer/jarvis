"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/stores/authStore";
import { useUIStore } from "@/stores/uiStore";
import { Eye, EyeOff, Zap, Shield, Cpu, Server, FlaskConical } from "lucide-react";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/mockData";

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, isLoading, error, clearError } = useAuthStore();
  const { isDemoMode, backendChecked } = useUIStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [glitchActive, setGlitchActive] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      router.push("/chat");
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    const interval = setInterval(() => {
      setGlitchActive(true);
      setTimeout(() => setGlitchActive(false), 200);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const fillDemoCredentials = () => {
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    clearError();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    try {
      await login(email, password);
    } catch {
      // Error handled by store
    }
  };

  return (
    <div className="min-h-screen bg-jarvis-bg flex items-center justify-center relative overflow-hidden">
      {/* Animated background grid */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0,212,255,0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,212,255,0.3) 1px, transparent 1px)
          `,
          backgroundSize: "50px 50px",
        }}
      />

      {/* Scan line effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary/30 to-transparent"
          animate={{ y: ["0vh", "100vh"] }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        />
      </div>

      {/* Radial glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(0,212,255,0.05) 0%, transparent 70%)" }}
        />
      </div>

      <div className="relative z-10 w-full max-w-md px-6">
        {/* Logo area */}
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="inline-flex items-center justify-center mb-6">
            <motion.div
              className="relative w-24 h-24"
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            >
              {/* Outer ring */}
              <div className="absolute inset-0 rounded-full border-2 border-primary/30" />
              {/* Inner ring */}
              <motion.div
                className="absolute inset-2 rounded-full border border-primary/60"
                animate={{ rotate: -360 }}
                transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
              />
              {/* Core */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary flex items-center justify-center animate-pulse-glow">
                  <Cpu className="w-5 h-5 text-primary" />
                </div>
              </div>
            </motion.div>
          </div>

          <motion.h1
            className={`text-5xl font-bold font-mono tracking-[0.3em] text-primary ${glitchActive ? "opacity-50" : ""}`}
            style={{
              textShadow: "0 0 20px rgba(0,212,255,0.5), 0 0 40px rgba(0,212,255,0.3)",
            }}
          >
            JARVIS
          </motion.h1>
          <p className="mt-2 text-jarvis-text-muted text-sm font-mono tracking-widest uppercase">
            Just A Rather Very Intelligent System
          </p>
          <div className="mt-3 flex items-center justify-center gap-2">
            <div className="h-px w-16 bg-gradient-to-r from-transparent to-primary/50" />
            <span className="text-primary/60 text-xs font-mono">v1.0.0</span>
            <div className="h-px w-16 bg-gradient-to-l from-transparent to-primary/50" />
          </div>
        </motion.div>

        {/* Login form */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="jarvis-card p-8 corner-bracket"
        >
          <div className="flex items-center gap-2 mb-6">
            <Shield className="w-4 h-4 text-primary" />
            <span className="text-sm font-mono text-jarvis-text-muted uppercase tracking-wider">
              Authentication Required
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-mono text-jarvis-text-muted uppercase tracking-wider mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="jarvis-input w-full font-mono text-sm"
                placeholder="user@jarvis.ai"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-jarvis-text-muted uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="jarvis-input w-full font-mono text-sm pr-12"
                  placeholder="••••••••••••"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-jarvis-text-muted hover:text-primary transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-red-400 text-sm font-mono bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-2"
                >
                  ⚠ {error}
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={isLoading || !email || !password}
              className="w-full py-3 px-6 rounded-lg font-mono text-sm font-semibold tracking-wider uppercase
                bg-primary/10 border border-primary/30 text-primary
                hover:bg-primary/20 hover:border-primary/60 hover:shadow-jarvis-sm
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-all duration-200 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>Initialize JARVIS</span>
                </>
              )}
            </button>
          </form>

          {/* Demo mode hint — shown once backend check completes */}
          <AnimatePresence>
            {backendChecked && isDemoMode && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30"
              >
                <div className="flex items-start gap-2.5">
                  <Server size={14} className="text-amber-400 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-amber-400 font-semibold mb-1">
                      Demo Mode — Backend offline
                    </p>
                    <p className="text-xs font-mono text-amber-400/70 mb-2">
                      Use the demo account to explore all features with static data.
                    </p>
                    <div className="flex items-center gap-3 text-xs font-mono text-amber-300 mb-2">
                      <span>📧 {DEMO_EMAIL}</span>
                      <span>🔑 {DEMO_PASSWORD}</span>
                    </div>
                    <button
                      type="button"
                      onClick={fillDemoCredentials}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-mono transition-colors"
                    >
                      <FlaskConical size={12} />
                      Auto-fill demo credentials
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-6 pt-6 border-t border-jarvis-border">
            <div className="flex items-center gap-4 text-xs font-mono text-jarvis-text-muted">
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${backendChecked && !isDemoMode ? "bg-success" : "bg-amber-400"}`} />
                <span>{backendChecked ? (isDemoMode ? "Demo Mode" : "Backend Online") : "Checking..."}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                <span>AI Ready</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
