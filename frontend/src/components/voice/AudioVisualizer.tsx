"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/components/ui/button";

interface AudioVisualizerProps {
  audioData: Float32Array | null;
  isActive: boolean;
  className?: string;
  mode?: "waveform" | "bars" | "circle";
  color?: string;
  height?: number;
}

export function AudioVisualizer({
  audioData,
  isActive,
  className,
  mode = "bars",
  color = "#00D4FF",
  height = 60,
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const { width, height: h } = canvas;
      ctx.clearRect(0, 0, width, h);

      if (!isActive || !audioData) {
        // Draw idle state
        if (mode === "bars") {
          const barCount = 32;
          const barWidth = width / barCount - 2;
          for (let i = 0; i < barCount; i++) {
            const x = i * (barWidth + 2);
            const barH = 2 + Math.sin(Date.now() * 0.002 + i * 0.3) * 2;
            ctx.fillStyle = `${color}30`;
            ctx.beginPath();
            ctx.roundRect(x, h / 2 - barH / 2, barWidth, barH, 2);
            ctx.fill();
          }
        }
        animFrameRef.current = requestAnimationFrame(draw);
        return;
      }

      if (mode === "bars") {
        const barCount = 32;
        const barWidth = (width - barCount * 2) / barCount;
        const step = Math.floor(audioData.length / barCount);

        for (let i = 0; i < barCount; i++) {
          const sample = audioData[i * step] || 0;
          const barH = Math.max(3, Math.abs(sample) * h * 3);
          const x = i * (barWidth + 2);
          const y = h / 2 - barH / 2;

          // Gradient color based on amplitude
          const intensity = Math.min(1, Math.abs(sample) * 5);
          const r = Math.round(0 + intensity * 50);
          const g = Math.round(212 - intensity * 50);
          const b = 255;
          ctx.fillStyle = `rgba(${r},${g},${b},${0.6 + intensity * 0.4})`;

          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barH, 2);
          ctx.fill();

          // Glow effect
          ctx.shadowColor = color;
          ctx.shadowBlur = intensity * 8;
        }
        ctx.shadowBlur = 0;
      } else if (mode === "waveform") {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.shadowColor = color;
        ctx.shadowBlur = 4;

        for (let i = 0; i < audioData.length; i++) {
          const x = (i / audioData.length) * width;
          const y = (0.5 + audioData[i] * 0.5) * h;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else if (mode === "circle") {
        const cx = width / 2;
        const cy = h / 2;
        const radius = Math.min(cx, cy) - 10;
        const bars = 64;

        for (let i = 0; i < bars; i++) {
          const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
          const sample = audioData[Math.floor((i / bars) * audioData.length)] || 0;
          const barLen = Math.max(3, Math.abs(sample) * radius);

          const x1 = cx + Math.cos(angle) * (radius - 5);
          const y1 = cy + Math.sin(angle) * (radius - 5);
          const x2 = cx + Math.cos(angle) * (radius - 5 + barLen);
          const y2 = cy + Math.sin(angle) * (radius - 5 + barLen);

          ctx.beginPath();
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.shadowColor = color;
          ctx.shadowBlur = Math.abs(sample) * 10;
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
      }

      animFrameRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [audioData, isActive, mode, color]);

  return (
    <canvas
      ref={canvasRef}
      width={300}
      height={height}
      className={cn("w-full", className)}
      style={{ height }}
    />
  );
}
