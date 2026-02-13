
import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  isPlaying: boolean;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ isPlaying, audioRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  useEffect(() => {
    // 仅在初次加载且没有建立连接时初始化
    if (!audioRef.current || audioCtxRef.current) return;

    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyzer = audioCtx.createAnalyser();
      analyzer.fftSize = 256;
      
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
    if (!isPlaying || !canvasRef.current || !analyzerRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyzerRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      if (analyzerRef.current) {
        analyzerRef.current.getByteFrequencyData(dataArray);
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const width = canvas.width;
      const height = canvas.height;
      const barWidth = (width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * height;
        
        const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
        gradient.addColorStop(0, 'rgba(129, 140, 248, 0.2)');
        gradient.addColorStop(1, 'rgba(129, 140, 248, 0.8)');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(x, height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };

    draw();
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying]);

  return (
    <canvas 
      ref={canvasRef} 
      className="w-full h-24 rounded-lg opacity-40"
      width={600}
      height={100}
    />
  );
};
