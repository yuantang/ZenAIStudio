import React, { useState, useRef } from "react";
import {
  X,
  Play,
  Pause,
  Download,
  Trash2,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Clock,
  Music,
} from "lucide-react";
import { MeditationResult } from "../types";

interface ContentLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  history: MeditationResult[];
  onDelete: (id: string) => void;
  onDownload: (blob: Blob, title: string) => void;
}

export const ContentLibrary: React.FC<ContentLibraryProps> = ({
  isOpen,
  onClose,
  history,
  onDelete,
  onDownload,
}) => {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioUrlRef = useRef<string>("");

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    const month = (d.getMonth() + 1).toString().padStart(2, "0");
    const day = d.getDate().toString().padStart(2, "0");
    const hours = d.getHours().toString().padStart(2, "0");
    const mins = d.getMinutes().toString().padStart(2, "0");
    return `${month}/${day} ${hours}:${mins}`;
  };

  const handlePlay = (item: MeditationResult) => {
    if (!item.audioBlob) return;

    if (playingId === item.id) {
      // 暂停当前播放
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }

    // 播放新音频
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
    }
    const url = URL.createObjectURL(item.audioBlob);
    audioUrlRef.current = url;

    if (audioRef.current) {
      audioRef.current.src = url;
      audioRef.current.play();
      setPlayingId(item.id);
    }
  };

  const handleAudioEnded = () => {
    setPlayingId(null);
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* 遮罩层 */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity duration-300"
        onClick={onClose}
      />

      {/* 抽屉面板 */}
      <div
        className="fixed top-0 right-0 h-full w-full max-w-xl bg-white/95 backdrop-blur-xl shadow-2xl z-50 flex flex-col overflow-hidden"
        style={{
          animation: "slideInRight 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100">
          <div className="flex items-center">
            <BookOpen className="w-5 h-5 text-indigo-500 mr-3" />
            <h2 className="text-lg font-bold text-slate-800 tracking-tight">
              内容库
            </h2>
            <span className="ml-3 px-2.5 py-0.5 bg-indigo-50 text-indigo-500 text-[10px] font-bold rounded-full">
              {history.length} 篇
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* 内容列表 */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-20">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                <Music className="w-7 h-7 text-slate-300" />
              </div>
              <p className="text-slate-400 text-sm font-medium mb-1">
                暂无历史内容
              </p>
              <p className="text-slate-300 text-xs">
                生成您的第一段冥想后，记录将出现在这里
              </p>
            </div>
          ) : (
            history.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all overflow-hidden"
              >
                {/* 卡片头部 */}
                <div className="px-5 py-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-sm font-bold text-slate-800 leading-snug flex-1 pr-3">
                      {item.script?.title || item.theme}
                    </h3>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {/* 播放按钮 */}
                      {item.audioBlob && (
                        <button
                          onClick={() => handlePlay(item)}
                          className={`w-8 h-8 flex items-center justify-center rounded-full transition-all ${
                            playingId === item.id
                              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200"
                              : "bg-indigo-50 text-indigo-500 hover:bg-indigo-100"
                          }`}
                          title={playingId === item.id ? "暂停" : "播放"}
                        >
                          {playingId === item.id ? (
                            <Pause className="w-3.5 h-3.5 fill-current" />
                          ) : (
                            <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                          )}
                        </button>
                      )}

                      {/* 下载按钮 */}
                      {item.audioBlob && (
                        <button
                          onClick={() =>
                            onDownload(
                              item.audioBlob!,
                              item.script?.title || item.theme,
                            )
                          }
                          className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all"
                          title="下载"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* 删除按钮 */}
                      <button
                        onClick={() => onDelete(item.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 text-slate-300 hover:bg-red-50 hover:text-red-400 transition-all"
                        title="删除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-[10px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(item.createdAt)}
                    </span>
                    <span className="text-slate-200">·</span>
                    <span>{item.script?.sections?.length || 0} 个段落</span>
                  </div>

                  {/* 播放进度指示 */}
                  {playingId === item.id && (
                    <div className="mt-3 flex items-center gap-2">
                      <div className="flex gap-0.5">
                        {[...Array(5)].map((_, i) => (
                          <div
                            key={i}
                            className="w-0.5 bg-indigo-400 rounded-full animate-pulse"
                            style={{
                              height: `${8 + Math.random() * 12}px`,
                              animationDelay: `${i * 0.15}s`,
                            }}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] text-indigo-400 font-medium">
                        正在播放...
                      </span>
                    </div>
                  )}
                </div>

                {/* 展开/折叠文稿 */}
                <div className="border-t border-slate-50">
                  <button
                    onClick={() => toggleExpand(item.id)}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-bold text-slate-400 hover:text-indigo-500 hover:bg-indigo-50/30 transition-all uppercase tracking-widest"
                  >
                    {expandedId === item.id ? (
                      <>
                        <ChevronUp className="w-3 h-3" /> 收起文稿
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3 h-3" /> 查看文稿
                      </>
                    )}
                  </button>

                  {expandedId === item.id && item.script?.sections && (
                    <div className="px-5 pb-5 space-y-4 border-t border-slate-50">
                      {item.script.sections.map((section, idx) => (
                        <div
                          key={idx}
                          className="relative pl-5 border-l-2 border-slate-100 pt-3"
                        >
                          <div className="absolute -left-[4px] top-4 w-1.5 h-1.5 rounded-full bg-slate-300" />
                          <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider">
                            {section.type}
                          </span>
                          <p className="text-slate-500 text-xs leading-relaxed mt-1 font-light">
                            {section.content}
                          </p>
                          <span className="text-[8px] text-slate-300 mt-1 block">
                            静默 {section.pauseSeconds}s
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* 底部操作栏 */}
        {history.length > 0 && (
          <div className="px-8 py-4 border-t border-slate-100 bg-white/80">
            <button
              onClick={() => {
                if (window.confirm("确定清除所有历史记录？此操作不可恢复。")) {
                  history.forEach((item) => onDelete(item.id));
                }
              }}
              className="w-full py-2.5 text-xs text-slate-400 hover:text-red-400 transition-colors font-medium"
            >
              清除全部记录
            </button>
          </div>
        )}
      </div>

      {/* 隐藏音频元素 */}
      <audio ref={audioRef} onEnded={handleAudioEnded} className="hidden" />

      {/* 动画样式 */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0.5; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </>
  );
};
