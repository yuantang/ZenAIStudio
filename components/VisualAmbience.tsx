import React, { useRef, useEffect, useCallback } from "react";

interface VisualAmbienceProps {
  isPlaying: boolean;
  ambientHint?: string;
}

/**
 * 可视化氛围伴侣 — 基于 Canvas 2D 合成的实时粒子动画
 * 根据 ambientHint 风格和播放状态动态变化
 */
export const VisualAmbience: React.FC<VisualAmbienceProps> = ({
  isPlaying,
  ambientHint = "forest",
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const timeRef = useRef(0);

  interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    opacity: number;
    life: number;
    maxLife: number;
    hue: number;
    type: "dot" | "ring" | "glow";
  }

  const getColorScheme = useCallback((hint: string) => {
    switch (hint) {
      case "forest":
        return { baseHue: 140, spread: 30, saturation: 40, lightness: 65 };
      case "rain":
        return { baseHue: 210, spread: 25, saturation: 35, lightness: 70 };
      case "ocean":
        return { baseHue: 195, spread: 35, saturation: 50, lightness: 60 };
      case "fire":
        return { baseHue: 25, spread: 30, saturation: 70, lightness: 60 };
      case "space":
        return { baseHue: 260, spread: 50, saturation: 30, lightness: 55 };
      default:
        return { baseHue: 230, spread: 20, saturation: 20, lightness: 75 };
    }
  }, []);

  const createParticle = useCallback(
    (w: number, h: number, hint: string): Particle => {
      const scheme = getColorScheme(hint);
      const types: Particle["type"][] = ["dot", "ring", "glow"];
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -Math.random() * 0.4 - 0.1,
        size: Math.random() * 3 + 1,
        opacity: Math.random() * 0.4 + 0.1,
        life: 0,
        maxLife: Math.random() * 300 + 200,
        hue: scheme.baseHue + (Math.random() - 0.5) * scheme.spread,
        type: types[Math.floor(Math.random() * types.length)],
      };
    },
    [getColorScheme],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    // 初始粒子
    const w = canvas.getBoundingClientRect().width;
    const h = canvas.getBoundingClientRect().height;
    particlesRef.current = Array.from({ length: 60 }, () =>
      createParticle(w, h, ambientHint),
    );

    const animate = () => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      timeRef.current += 0.016;

      const scheme = getColorScheme(ambientHint);
      const breathCycle = Math.sin(timeRef.current * 0.3) * 0.5 + 0.5;
      const activeScale = isPlaying ? 1 : 0.3;

      particlesRef.current.forEach((p, i) => {
        p.life++;
        if (p.life > p.maxLife) {
          particlesRef.current[i] = createParticle(
            rect.width,
            rect.height,
            ambientHint,
          );
          return;
        }

        // 呼吸式运动
        const lifeRatio = p.life / p.maxLife;
        const fadeIn = Math.min(lifeRatio * 5, 1);
        const fadeOut = Math.max(1 - (lifeRatio - 0.7) / 0.3, 0);
        const alpha =
          p.opacity * fadeIn * (lifeRatio > 0.7 ? fadeOut : 1) * activeScale;

        // 柔和漂浮 + 呼吸缩放
        p.x += p.vx + Math.sin(timeRef.current + i * 0.1) * 0.15;
        p.y += p.vy * activeScale;
        const breathSize = p.size * (1 + breathCycle * 0.3 * activeScale);

        // 边界循环
        if (p.y < -10) p.y = rect.height + 10;
        if (p.x < -10) p.x = rect.width + 10;
        if (p.x > rect.width + 10) p.x = -10;

        ctx.save();
        ctx.globalAlpha = alpha;

        const color = `hsla(${p.hue}, ${scheme.saturation}%, ${scheme.lightness}%, 1)`;

        if (p.type === "glow") {
          const gradient = ctx.createRadialGradient(
            p.x,
            p.y,
            0,
            p.x,
            p.y,
            breathSize * 4,
          );
          gradient.addColorStop(0, color);
          gradient.addColorStop(
            1,
            `hsla(${p.hue}, ${scheme.saturation}%, ${scheme.lightness}%, 0)`,
          );
          ctx.fillStyle = gradient;
          ctx.fillRect(
            p.x - breathSize * 4,
            p.y - breathSize * 4,
            breathSize * 8,
            breathSize * 8,
          );
        } else if (p.type === "ring") {
          ctx.strokeStyle = color;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, breathSize * 2, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, breathSize, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      });

      // 中央呼吸光环（仅播放时）
      if (isPlaying) {
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const radius = 60 + breathCycle * 30;
        const gradient = ctx.createRadialGradient(
          cx,
          cy,
          radius * 0.3,
          cx,
          cy,
          radius,
        );
        gradient.addColorStop(
          0,
          `hsla(${scheme.baseHue}, ${scheme.saturation}%, ${scheme.lightness}%, ${0.06 * breathCycle})`,
        );
        gradient.addColorStop(
          1,
          `hsla(${scheme.baseHue}, ${scheme.saturation}%, ${scheme.lightness}%, 0)`,
        );
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, rect.width, rect.height);
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [isPlaying, ambientHint, createParticle, getColorScheme]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: isPlaying ? 1 : 0.4, transition: "opacity 1.5s ease" }}
    />
  );
};
