"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic, MicOff, Volume2, VolumeX, RefreshCw, Settings,
  Radio, Loader2
} from "lucide-react";
import { useVoice } from "@/hooks/useVoice";
import { AudioVisualizer } from "./AudioVisualizer";
import { cn } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface VoiceInterfaceProps {
  onTranscript?: (text: string) => void;
  className?: string;
}

const stateLabels: Record<string, string> = {
  idle: "Ready",
  listening: "Listening...",
  processing: "Processing...",
  speaking: "Speaking...",
  error: "Error",
};

const stateColors: Record<string, string> = {
  idle: "muted",
  listening: "running",
  processing: "warning",
  speaking: "success",
  error: "danger",
};

export function VoiceInterface({ onTranscript, className }: VoiceInterfaceProps) {
  const [pushToTalk, setPushToTalk] = useState(false);
  const [continuous, setContinuous] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const {
    voiceState,
    transcript,
    audioData,
    volume,
    isPlaying,
    toggleListening,
    startListening,
    stopListening,
    stopAudio,
    isListening,
    isProcessing,
    isSpeaking,
  } = useVoice({
    onTranscript: (text) => {
      onTranscript?.(text);
    },
    pushToTalk,
    continuousListening: continuous,
  });

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-primary" />
          <span className="text-sm font-mono font-semibold text-jarvis-text">Voice Interface</span>
        </div>
        <Badge variant={stateColors[voiceState] as "muted" | "running" | "warning" | "success" | "danger"} dot>
          {stateLabels[voiceState]}
        </Badge>
      </div>

      {/* Visualizer */}
      <div className="relative rounded-xl glass border border-jarvis-border p-4">
        <AudioVisualizer
          audioData={audioData}
          isActive={isListening || isSpeaking}
          mode="bars"
          height={60}
          color={isSpeaking ? "#00FF88" : "#00D4FF"}
        />
        {/* Volume indicator */}
        <div className="absolute bottom-2 right-3 flex items-center gap-1">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className={cn(
                "w-1 h-3 rounded-full transition-all duration-100",
                volume * 5 > i ? "bg-primary" : "bg-jarvis-border"
              )}
              style={{ height: `${6 + i * 2}px` }}
            />
          ))}
        </div>
      </div>

      {/* Main mic button */}
      <div className="flex items-center justify-center py-4">
        <div className="relative">
          {/* Ripple rings */}
          <AnimatePresence>
            {isListening && (
              <>
                {[1, 2, 3].map((ring) => (
                  <motion.div
                    key={ring}
                    className="absolute inset-0 rounded-full border border-primary"
                    initial={{ opacity: 0.6, scale: 1 }}
                    animate={{ opacity: 0, scale: 2 + ring * 0.5 }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      delay: ring * 0.4,
                      ease: "easeOut",
                    }}
                  />
                ))}
              </>
            )}
          </AnimatePresence>

          <motion.button
            onMouseDown={pushToTalk ? startListening : undefined}
            onMouseUp={pushToTalk ? stopListening : undefined}
            onTouchStart={pushToTalk ? startListening : undefined}
            onTouchEnd={pushToTalk ? stopListening : undefined}
            onClick={!pushToTalk ? toggleListening : undefined}
            disabled={isProcessing}
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.05 }}
            className={cn(
              "relative w-20 h-20 rounded-full flex items-center justify-center",
              "border-2 transition-all duration-300 shadow-lg",
              isListening
                ? "bg-primary/20 border-primary shadow-jarvis-lg"
                : isProcessing
                ? "bg-amber-500/10 border-amber-500/50"
                : isSpeaking
                ? "bg-success/10 border-success/50"
                : "bg-jarvis-surface border-jarvis-border hover:border-primary/50 hover:bg-primary/5"
            )}
          >
            {isProcessing ? (
              <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
            ) : isListening ? (
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 0.5, repeat: Infinity }}
              >
                <Mic className="w-8 h-8 text-primary" />
              </motion.div>
            ) : (
              <Mic className={cn(
                "w-8 h-8",
                isSpeaking ? "text-success" : "text-jarvis-text-muted"
              )} />
            )}
          </motion.button>
        </div>
      </div>

      {/* Transcript */}
      <AnimatePresence>
        {transcript && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="glass border border-jarvis-border rounded-xl p-4"
          >
            <p className="text-xs font-mono text-jarvis-text-muted mb-1 uppercase tracking-wider">Transcript</p>
            <p className="text-sm text-jarvis-text font-mono">{transcript}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Push to Talk toggle */}
          <button
            onClick={() => setPushToTalk(!pushToTalk)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border transition-all",
              pushToTalk
                ? "bg-primary/10 border-primary/30 text-primary"
                : "glass border-jarvis-border text-jarvis-text-muted hover:text-primary"
            )}
          >
            <span>PTT</span>
          </button>

          {/* Auto-speak */}
          <button
            onClick={() => setAutoSpeak(!autoSpeak)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border transition-all",
              autoSpeak
                ? "bg-success/10 border-success/30 text-success"
                : "glass border-jarvis-border text-jarvis-text-muted hover:text-primary"
            )}
          >
            {autoSpeak ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span>Auto Speak</span>
          </button>
        </div>

        {/* Stop audio */}
        {isPlaying && (
          <button
            onClick={stopAudio}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all"
          >
            <VolumeX className="w-3.5 h-3.5" />
            Stop Audio
          </button>
        )}
      </div>
    </div>
  );
}
