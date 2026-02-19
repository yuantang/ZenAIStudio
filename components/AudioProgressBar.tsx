import React, { useState, useEffect, useRef, useCallback } from "react";

interface AudioProgressBarProps {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  isPlaying: boolean;
}

/**
 * 音频播放进度条
 * - 实时进度 + 拖拽 seek
 * - 时间显示 (mm:ss / mm:ss)
 * - 悬停预览时间
 * - 缓冲进度指示
 */
export const AudioProgressBar: React.FC<AudioProgressBarProps> = ({
  audioRef,
  isPlaying,
}) => {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [buffered, setBuffered] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);
  const dragValueRef = useRef(0);

  // 格式化时间
  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || seconds < 0) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // 实时更新播放进度
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      if (!isDragging) {
        setCurrentTime(audio.currentTime);
      }
    };

    const onDurationChange = () => {
      setDuration(audio.duration);
    };

    const onProgress = () => {
      if (audio.buffered.length > 0) {
        setBuffered(audio.buffered.end(audio.buffered.length - 1));
      }
    };

    const onLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("progress", onProgress);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);

    // 初始化
    if (audio.duration) setDuration(audio.duration);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("progress", onProgress);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, [audioRef, isDragging]);

  // 计算鼠标在进度条上的比例
  const getProgressFromEvent = useCallback(
    (e: MouseEvent | React.MouseEvent) => {
      if (!barRef.current) return 0;
      const rect = barRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      return x / rect.width;
    },
    [],
  );

  // 拖拽逻辑
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      const ratio = getProgressFromEvent(e);
      dragValueRef.current = ratio * duration;
      setCurrentTime(dragValueRef.current);
    },
    [duration, getProgressFromEvent],
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const ratio = getProgressFromEvent(e);
      dragValueRef.current = ratio * duration;
      setCurrentTime(dragValueRef.current);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      if (audioRef.current) {
        audioRef.current.currentTime = dragValueRef.current;
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, duration, audioRef, getProgressFromEvent]);

  // 点击 seek
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) return;
      const ratio = getProgressFromEvent(e);
      const newTime = ratio * duration;
      if (audioRef.current) {
        audioRef.current.currentTime = newTime;
        setCurrentTime(newTime);
      }
    },
    [duration, audioRef, getProgressFromEvent, isDragging],
  );

  // 悬停预览
  const handleMouseMoveBar = useCallback((e: React.MouseEvent) => {
    if (!barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    setHoverX(e.clientX - rect.left);
  }, []);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (buffered / duration) * 100 : 0;
  const hoverPercent =
    hoverX !== null && barRef.current
      ? (hoverX / barRef.current.getBoundingClientRect().width) * 100
      : null;
  const hoverTime =
    hoverPercent !== null ? (hoverPercent / 100) * duration : null;

  return (
    <div className="w-full space-y-2">
      {/* 进度条容器 */}
      <div
        ref={barRef}
        className="relative h-6 flex items-center cursor-pointer group"
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        onMouseMove={handleMouseMoveBar}
        onMouseLeave={() => setHoverX(null)}
      >
        {/* 轨道背景 */}
        <div className="absolute left-0 right-0 h-1 bg-slate-200/60 dark:bg-slate-700/60 rounded-full overflow-hidden group-hover:h-1.5 transition-all">
          {/* 缓冲进度 */}
          <div
            className="absolute inset-y-0 left-0 bg-slate-300/40 dark:bg-slate-600/40 rounded-full"
            style={{ width: `${bufferedPercent}%` }}
          />
          {/* 播放进度 */}
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-400 to-violet-500 dark:from-indigo-500 dark:to-violet-400 rounded-full transition-[width] duration-100"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* 拖拽手柄 */}
        <div
          className={`absolute w-3.5 h-3.5 bg-white dark:bg-slate-200 rounded-full shadow-md border-2 border-indigo-500 dark:border-indigo-400 transform -translate-x-1/2 transition-transform ${
            isDragging ? "scale-125" : "scale-0 group-hover:scale-100"
          }`}
          style={{ left: `${progressPercent}%` }}
        />

        {/* 悬停时间提示 */}
        {hoverTime !== null && !isDragging && (
          <div
            className="absolute -top-7 transform -translate-x-1/2 px-2 py-0.5 bg-slate-800 dark:bg-slate-700 text-white text-[9px] font-bold rounded-md pointer-events-none"
            style={{ left: `${hoverPercent}%` }}
          >
            {formatTime(hoverTime)}
          </div>
        )}
      </div>

      {/* 时间显示 */}
      <div className="flex justify-between text-[10px] font-bold text-slate-400 dark:text-slate-500 tabular-nums">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
};
