import React, { useEffect, useRef } from "react";

interface AudioVisualizerProps {
  isPlaying: boolean;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  color?: string;
}

/**
 * 圆形极坐标呼吸可视化器（v2）
 *
 * 特性：
 * - 双层圆环：内圈响应低频（体感），外圈响应全频段（细节）
 * - 呼吸脉冲：中心圆随整体能量 bloom
 * - 辉光尾迹：圆环线条带发光效果
 * - 暂停时衰减为静态呼吸环
 */
export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  isPlaying,
  audioRef,
  color = "#6366f1",
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const timeRef = useRef(0);
  // 平滑缓冲：避免频谱跳变
  const smoothRef = useRef<Float32Array | null>(null);

  useEffect(() => {
    if (!audioRef.current || audioCtxRef.current) return;

    try {
      const audioCtx = new (
        window.AudioContext || (window as any).webkitAudioContext
      )();
      const analyzer = audioCtx.createAnalyser();
      analyzer.fftSize = 512; // 256 bins，更多细节
      analyzer.smoothingTimeConstant = 0.82; // 平滑参数

      const source = audioCtx.createMediaElementSource(audioRef.current);
      source.connect(analyzer);
      analyzer.connect(audioCtx.destination);

      audioCtxRef.current = audioCtx;
      analyzerRef.current = analyzer;
      sourceRef.current = source;
    } catch (e) {
      console.warn("AudioContext initialization failed", e);
    }

    return () => {
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
    };
  }, [audioRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // HiDPI 适配
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;
    const cx = W / 2;
    const cy = H / 2;

    const bufferLength = analyzerRef.current?.frequencyBinCount || 128;
    const dataArray = new Uint8Array(bufferLength);
    if (!smoothRef.current || smoothRef.current.length !== bufferLength) {
      smoothRef.current = new Float32Array(bufferLength);
    }

    // 解析 CSS 颜色为 HSL 分量
    const parseColor = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      const max = Math.max(r, g, b),
        min = Math.min(r, g, b);
      let h = 0;
      const l = (max + min) / 2;
      if (max !== min) {
        const d = max - min;
        const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r:
            h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
            break;
          case g:
            h = ((b - r) / d + 2) / 6;
            break;
          case b:
            h = ((r - g) / d + 4) / 6;
            break;
        }
        return { h: h * 360, s: s * 100, l: l * 100 };
      }
      return { h: 0, s: 0, l: l * 100 };
    };

    const hsl = parseColor(color);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      timeRef.current += 0.016;
      ctx.clearRect(0, 0, W, H);

      // 获取频谱数据
      if (analyzerRef.current && isPlaying) {
        analyzerRef.current.getByteFrequencyData(dataArray);
      }

      // 指数平滑
      const smooth = smoothRef.current!;
      const smoothFactor = isPlaying ? 0.25 : 0.05;
      const decayTarget = isPlaying ? 0 : 0;
      for (let i = 0; i < bufferLength; i++) {
        const target = isPlaying ? dataArray[i] / 255 : decayTarget;
        smooth[i] += (target - smooth[i]) * smoothFactor;
      }

      // 计算整体能量（用于中心 bloom）
      let totalEnergy = 0;
      for (let i = 0; i < bufferLength; i++) totalEnergy += smooth[i];
      totalEnergy /= bufferLength;

      // 呼吸基频
      const breathPhase = Math.sin(timeRef.current * 0.4) * 0.5 + 0.5;
      const activeBloom = isPlaying ? totalEnergy : breathPhase * 0.15;

      // ── 中心呼吸光晕 ──
      const bloomRadius = 20 + activeBloom * 35;
      const bloomGrad = ctx.createRadialGradient(
        cx,
        cy,
        0,
        cx,
        cy,
        bloomRadius,
      );
      bloomGrad.addColorStop(
        0,
        `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${0.15 + activeBloom * 0.2})`,
      );
      bloomGrad.addColorStop(
        0.5,
        `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l + 10}%, ${0.08 + activeBloom * 0.1})`,
      );
      bloomGrad.addColorStop(1, `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, 0)`);
      ctx.fillStyle = bloomGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, bloomRadius, 0, Math.PI * 2);
      ctx.fill();

      // ── 内圈：低频响应（前 32 个 bin） ──
      const innerBins = 32;
      const innerBaseR = 25 + breathPhase * 3;
      const innerMaxR = 18;

      ctx.beginPath();
      for (let i = 0; i <= innerBins; i++) {
        const idx = i % innerBins;
        const angle = (idx / innerBins) * Math.PI * 2 - Math.PI / 2;
        const val = smooth[idx] || 0;
        const r = innerBaseR + val * innerMaxR;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.strokeStyle = `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${0.3 + activeBloom * 0.3})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 内圈填充
      ctx.fillStyle = `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${0.03 + activeBloom * 0.05})`;
      ctx.fill();

      // ── 外圈：全频段细节（64 个 bin） ──
      const outerBins = 64;
      const outerBaseR = 45 + breathPhase * 5;
      const outerMaxR = 25;

      // 发光底层（模糊效果）
      ctx.save();
      ctx.shadowColor = `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, 0.5)`;
      ctx.shadowBlur = 8 + activeBloom * 12;
      ctx.beginPath();
      for (let i = 0; i <= outerBins; i++) {
        const idx = i % outerBins;
        const freqIdx = Math.floor((idx / outerBins) * bufferLength);
        const angle = (idx / outerBins) * Math.PI * 2 - Math.PI / 2;
        const val = smooth[freqIdx] || 0;
        const r = outerBaseR + val * outerMaxR;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();

      // 渐变描边
      const strokeGrad = ctx.createLinearGradient(
        cx - outerBaseR,
        cy,
        cx + outerBaseR,
        cy,
      );
      strokeGrad.addColorStop(
        0,
        `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${0.4 + activeBloom * 0.4})`,
      );
      strokeGrad.addColorStop(
        0.5,
        `hsla(${hsl.h + 30}, ${hsl.s}%, ${hsl.l + 10}%, ${0.5 + activeBloom * 0.3})`,
      );
      strokeGrad.addColorStop(
        1,
        `hsla(${hsl.h - 20}, ${hsl.s}%, ${hsl.l}%, ${0.4 + activeBloom * 0.4})`,
      );
      ctx.strokeStyle = strokeGrad;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // 外圈半透明填充
      ctx.fillStyle = `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l + 15}%, ${0.02 + activeBloom * 0.03})`;
      ctx.fill();

      // ── 频率刻度线（每隔 8 个 bin 画一条辐射线） ──
      if (isPlaying) {
        for (let i = 0; i < outerBins; i += 8) {
          const freqIdx = Math.floor((i / outerBins) * bufferLength);
          const val = smooth[freqIdx] || 0;
          if (val < 0.1) continue;
          const angle = (i / outerBins) * Math.PI * 2 - Math.PI / 2;
          const rInner = outerBaseR + val * outerMaxR;
          const rOuter = rInner + val * 8;
          ctx.beginPath();
          ctx.moveTo(
            cx + Math.cos(angle) * rInner,
            cy + Math.sin(angle) * rInner,
          );
          ctx.lineTo(
            cx + Math.cos(angle) * rOuter,
            cy + Math.sin(angle) * rOuter,
          );
          ctx.strokeStyle = `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${val * 0.5})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      // ── 地平线反射（镜像淡影） ──
      const reflectY = cy + outerBaseR + outerMaxR + 10;
      if (reflectY < H) {
        const reflGrad = ctx.createLinearGradient(
          0,
          reflectY - 5,
          0,
          reflectY + 15,
        );
        reflGrad.addColorStop(
          0,
          `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${0.05 + activeBloom * 0.05})`,
        );
        reflGrad.addColorStop(1, `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, 0)`);
        ctx.fillStyle = reflGrad;
        ctx.fillRect(
          cx - outerBaseR - outerMaxR,
          reflectY - 5,
          (outerBaseR + outerMaxR) * 2,
          20,
        );
      }
    };

    animationRef.current = requestAnimationFrame(draw);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, color]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-40 rounded-2xl"
      style={{
        width: "100%",
        height: "160px",
        opacity: isPlaying ? 1 : 0.5,
        transition: "opacity 0.8s ease",
      }}
    />
  );
};
