"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { VoiceState } from "@/types";
import { api } from "@/lib/api";
import { useUIStore } from "@/stores/uiStore";

interface UseVoiceOptions {
  onTranscript?: (text: string) => void;
  onError?: (error: string) => void;
  pushToTalk?: boolean;
  continuousListening?: boolean;
}

export function useVoice(options: UseVoiceOptions = {}) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [audioData, setAudioData] = useState<Float32Array | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceStateRef = useRef<VoiceState>("idle");

  const { addNotification } = useUIStore();

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
      stopAudio();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const setupAudioContext = useCallback(async () => {
    if (!audioContextRef.current || audioContextRef.current.state === "closed") {
      audioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  const startListening = useCallback(async () => {
    if (voiceState !== "idle" && voiceState !== "error") return;

    try {
      setVoiceState("listening");
      voiceStateRef.current = "listening";
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      // Setup audio analyser for visualization
      const audioContext = await setupAudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      // Visualize audio
      const visualize = () => {
        if (!analyserRef.current) return;
        const dataArray = new Float32Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getFloatTimeDomainData(dataArray);
        setAudioData(dataArray);

        // Calculate volume
        const rms = Math.sqrt(dataArray.reduce((sum, val) => sum + val * val, 0) / dataArray.length);
        setVolume(Math.min(1, rms * 10));

        animationFrameRef.current = requestAnimationFrame(visualize);
      };
      visualize();

      // Setup MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        await transcribeAudio(audioBlob);
      };

      recorder.start(100); // Collect data every 100ms

      // Auto-stop on silence (3 seconds)
      if (!options.continuousListening) {
        silenceTimerRef.current = setTimeout(() => {
          if (voiceStateRef.current === "listening") {
            stopListening();
          }
        }, 10000); // Max 10 seconds
      }
    } catch (error) {
      setVoiceState("error");
      const message = error instanceof Error ? error.message : "Microphone access denied";
      addNotification("error", "Voice Error", message);
      options.onError?.(message);
    }
  }, [voiceState, options]);

  const stopListening = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    setAudioData(null);
    setVolume(0);

    if (voiceState === "listening") {
      setVoiceState("processing");
    }
  }, [voiceState]);

  const transcribeAudio = useCallback(async (audioBlob: Blob) => {
    setVoiceState("processing");
    try {
      const response = await api.voice.transcribe(audioBlob);
      const { transcript: text, confidence } = response.data;
      setTranscript(text);
      setVoiceState("idle");
      options.onTranscript?.(text);
    } catch (error) {
      setVoiceState("error");
      const message = (error as Error).message || "Transcription failed";
      addNotification("error", "Transcription Failed", message);
      options.onError?.(message);
      setTimeout(() => setVoiceState("idle"), 2000);
    }
  }, [options]);

  const speak = useCallback(async (text: string, voice?: string) => {
    if (isPlaying) {
      stopAudio();
    }

    setVoiceState("speaking");
    setIsPlaying(true);

    try {
      const response = await api.voice.synthesize(text, voice);
      const audioBlob = response.data;
      const audioUrl = URL.createObjectURL(audioBlob);

      const audioContext = await setupAudioContext();
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      audioSourceRef.current = source;

      source.onended = () => {
        setVoiceState("idle");
        setIsPlaying(false);
        URL.revokeObjectURL(audioUrl);
      };

      source.start(0);
    } catch (error) {
      setVoiceState("error");
      setIsPlaying(false);
      const message = (error as Error).message || "Speech synthesis failed";
      addNotification("error", "TTS Failed", message);
      setTimeout(() => setVoiceState("idle"), 2000);
    }
  }, [isPlaying, setupAudioContext]);

  const stopAudio = useCallback(() => {
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch {
        // Already stopped
      }
      audioSourceRef.current = null;
    }
    setIsPlaying(false);
    if (voiceState === "speaking") {
      setVoiceState("idle");
    }
  }, [voiceState]);

  const toggleListening = useCallback(() => {
    if (voiceState === "listening") {
      stopListening();
    } else if (voiceState === "idle") {
      startListening();
    }
  }, [voiceState, startListening, stopListening]);

  return {
    voiceState,
    transcript,
    audioData,
    volume,
    isPlaying,
    startListening,
    stopListening,
    toggleListening,
    speak,
    stopAudio,
    isListening: voiceState === "listening",
    isProcessing: voiceState === "processing",
    isSpeaking: voiceState === "speaking",
  };
}
