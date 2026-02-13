import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Sparkles,
  Wind,
  Volume2,
  Download,
  Play,
  Pause,
  RefreshCw,
  History,
  ShieldCheck,
  Zap,
  Leaf,
  MessageSquare,
  AlertCircle,
  Settings,
  BookOpen,
} from "lucide-react";
import {
  GenerationStatus,
  MeditationResult,
  ExperienceLevel,
  MoodState,
  MeditationStyle,
} from "./types";
import {
  BACKGROUND_TRACKS,
  VOICES,
  MEDITATION_PRESETS,
  DURATION_OPTIONS,
  EXPERIENCE_OPTIONS,
  MOOD_OPTIONS,
  STYLE_OPTIONS,
} from "./constants";
import {
  generateMeditationScript,
  synthesizeSpeech,
  synthesizeFullMeditation,
} from "./services/geminiService";
import {
  decodePcm,
  mixMeditationAudio,
  mixSingleVoiceAudio,
} from "./services/audioService";
import { AudioVisualizer } from "./components/AudioVisualizer";
import { ContentLibrary } from "./components/ContentLibrary";

// ---- localStorage 持久化工具 ----
const STORAGE_KEY = "zenai_history";

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });

const base64ToBlob = (dataUrl: string): Blob => {
  const [header, data] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] || "audio/wav";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

interface StoredResult {
  id: string;
  theme: string;
  script: any;
  audioBase64: string | null;
  createdAt: number;
}

const saveHistoryToStorage = async (history: MeditationResult[]) => {
  try {
    const items: StoredResult[] = await Promise.all(
      history.map(async (h) => ({
        id: h.id,
        theme: h.theme,
        script: h.script,
        audioBase64: h.audioBlob ? await blobToBase64(h.audioBlob) : null,
        createdAt: h.createdAt,
      })),
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    console.warn("[Storage] 保存历史失败 (可能超出容量):", e);
  }
};

const loadHistoryFromStorage = (): MeditationResult[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const items: StoredResult[] = JSON.parse(raw);
    return items.map((s) => ({
      id: s.id,
      theme: s.theme,
      script: s.script,
      audioBlob: s.audioBase64 ? base64ToBlob(s.audioBase64) : null,
      createdAt: s.createdAt,
    }));
  } catch {
    return [];
  }
};

const LOADING_MESSAGES = [
  "正在对齐您的呼吸节奏...",
  "正在构筑宁静的心灵意象...",
  "正在邀请资深引导师入场...",
  "正在为您调制自然的背景声场...",
  "每一颗粒子都在为您安静下来...",
  "深呼吸，美好的音频即将呈现...",
];

const App: React.FC = () => {
  const [theme, setTheme] = useState("");
  const [selectedBG, setSelectedBG] = useState(BACKGROUND_TRACKS[0].id);
  const [selectedVoice, setSelectedVoice] = useState("Zephyr");
  const [selectedDuration, setSelectedDuration] = useState(10);
  const [selectedExperience, setSelectedExperience] =
    useState<ExperienceLevel>("intermediate");
  const [selectedMood, setSelectedMood] = useState<MoodState>("neutral");
  const [selectedStyle, setSelectedStyle] =
    useState<MeditationStyle>("mindfulness");
  const [showPersonalization, setShowPersonalization] = useState(false);
  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [progress, setProgress] = useState(0);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [result, setResult] = useState<MeditationResult | null>(null);
  const [history, setHistory] = useState<MeditationResult[]>(() =>
    loadHistoryFromStorage(),
  );
  const [showLibrary, setShowLibrary] = useState(false);

  // 密钥状态管理
  const [hasApiKey, setHasApiKey] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // 检测密钥并轮播加载文案
  useEffect(() => {
    // 检查 process.env 是否存在且 API_KEY 是否有效
    const checkKey = () => {
      const key = process.env.API_KEY;
      setHasApiKey(!!key && key !== "YOUR_API_KEY");
    };
    checkKey();

    let interval: number;
    if (
      status !== GenerationStatus.IDLE &&
      status !== GenerationStatus.COMPLETED &&
      status !== GenerationStatus.ERROR
    ) {
      interval = window.setInterval(() => {
        setLoadingMsgIdx((prev) => (prev + 1) % LOADING_MESSAGES.length);
      }, 3500);
    }
    return () => clearInterval(interval);
  }, [status]);

  const handleOpenKeyDialog = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      // 这里的 API_KEY 会被自动注入，重新检测即可
      const key = process.env.API_KEY;
      setHasApiKey(!!key);
    } else {
      alert("请在 Vercel 环境变量中配置 API_KEY，然后点击 Redeploy 重新部署。");
    }
  };

  const processSingleItem = async (currentTheme: string) => {
    setStatus(GenerationStatus.WRITING);
    setProgress(5);
    const script = await generateMeditationScript(
      currentTheme,
      selectedDuration,
      {
        experience: selectedExperience,
        mood: selectedMood,
        style: selectedStyle,
      },
    );
    setProgress(20);

    setStatus(GenerationStatus.VOICING);
    setProgress(30);

    // 整篇合成：单次 TTS 调用确保全程声纹一致
    const rawPcm = await synthesizeFullMeditation(script, selectedVoice);
    setProgress(75);

    const ctx = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();
    const voiceBuffer = await decodePcm(rawPcm, ctx);
    await ctx.close();
    setProgress(80);

    setStatus(GenerationStatus.MIXING);
    const track = BACKGROUND_TRACKS.find((t) => t.id === selectedBG)!;
    const finalBlob = await mixSingleVoiceAudio(
      voiceBuffer,
      track.url,
      script.sections,
    );

    setProgress(100);
    return {
      id: Math.random().toString(36).substr(2, 9),
      theme: currentTheme,
      script,
      audioBlob: finalBlob,
      createdAt: Date.now(),
    };
  };

  const handleGenerate = async () => {
    if (!theme) return;
    if (!hasApiKey) {
      handleOpenKeyDialog();
      return;
    }
    try {
      console.log(">>> 开始生成流程 <<<");
      const res = await processSingleItem(theme);
      console.log(">>> 生成成功！正在展示结果 <<<");
      setResult(res);
      setHistory((prev) => {
        const next = [res, ...prev];
        saveHistoryToStorage(next);
        return next;
      });
      setStatus(GenerationStatus.COMPLETED);
    } catch (e: any) {
      console.error("!!! 生成中断 !!!", e);
      alert(e.message || "生成失败，请重试。");
      setStatus(GenerationStatus.ERROR);
    }
  };

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) audioRef.current.pause();
      else audioRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  const downloadAudio = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ZenAI_${name.replace(/\s+/g, "_")}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const applyPreset = (prompt: string) => {
    setTheme(prompt);
  };

  const handleDeleteFromHistory = useCallback((id: string) => {
    setHistory((prev) => {
      const next = prev.filter((item) => item.id !== id);
      saveHistoryToStorage(next);
      return next;
    });
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-10 lg:py-20 relative">
      {/* 密钥配置警告 - 仅在缺失时显示 */}
      {!hasApiKey && (
        <div className="fixed top-0 left-0 w-full bg-amber-500 text-white py-2 px-4 z-50 flex items-center justify-center text-xs font-bold gap-4 shadow-lg animate-in slide-in-from-top duration-500">
          <AlertCircle className="w-4 h-4" />
          检测到 API_KEY 尚未生效。如果您已在 Vercel 配置，请点击右侧按钮。
          <button
            onClick={handleOpenKeyDialog}
            className="bg-white text-amber-600 px-3 py-1 rounded-md hover:bg-amber-50 transition-colors flex items-center gap-1"
          >
            <Settings className="w-3 h-3" /> 激活密钥
          </button>
        </div>
      )}

      {/* 背景动态装饰 */}
      <div className="fixed inset-0 -z-10 bg-[#f9fafc] overflow-hidden">
        <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-indigo-100/40 rounded-full blur-[100px] breathing-glow"></div>
        <div
          className="absolute bottom-[-5%] left-[-5%] w-[500px] h-[500px] bg-teal-50/50 rounded-full blur-[90px] breathing-glow"
          style={{ animationDelay: "2s" }}
        ></div>
      </div>

      <header className="text-center mb-16 md:mb-24">
        <div className="inline-flex items-center px-4 py-2 rounded-full bg-white/80 border border-slate-100 text-slate-500 text-[10px] font-bold tracking-[0.2em] uppercase mb-6 shadow-sm">
          <ShieldCheck className="w-3.5 h-3.5 mr-2 text-indigo-500" />{" "}
          Professional ZenAI Studio
        </div>
        <h1 className="text-5xl md:text-7xl font-serif font-bold text-slate-900 mb-6 tracking-tight">
          ZenAI Studio
        </h1>
        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto font-light leading-relaxed px-4">
          由 Gemini 3 Pro 驱动的深度冥想创作系统。
          <br className="hidden md:block" />
          为您定制绝对稳定的疗愈频率。
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
        {/* 控制台 */}
        <div className="lg:col-span-5 space-y-8 order-2 lg:order-1">
          <div className="glass p-8 md:p-12 rounded-[3rem] shadow-xl shadow-slate-200/40 border border-white/50">
            <h2 className="text-xl font-bold text-slate-800 mb-8 flex items-center justify-between">
              <span className="flex items-center">
                <Sparkles className="w-5 h-5 mr-3 text-indigo-500" /> 工作台配置
              </span>
              <div
                className={`w-2 h-2 rounded-full ${hasApiKey ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-amber-400 shadow-[0_0_8px_#fbbf24]"}`}
                title={hasApiKey ? "密钥已连接" : "密钥待激活"}
              ></div>
            </h2>

            <div className="space-y-8">
              <section>
                <label className="block text-[10px] font-black text-slate-400 mb-4 uppercase tracking-[0.2em] flex items-center">
                  <MessageSquare className="w-4 h-4 mr-2" /> 冥想主题 / Intent
                </label>

                <div className="flex flex-wrap gap-2 mb-4">
                  {MEDITATION_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => applyPreset(p.prompt)}
                      className="px-3 py-1.5 rounded-full bg-indigo-50/50 border border-indigo-100/50 text-indigo-600 text-[9px] font-bold hover:bg-indigo-600 hover:text-white transition-all"
                    >
                      {p.icon} {p.label}
                    </button>
                  ))}
                </div>

                <textarea
                  className="w-full px-6 py-5 rounded-[1.5rem] border-none ring-1 ring-slate-100 focus:ring-2 focus:ring-indigo-400 outline-none transition-all bg-white/50 text-slate-700 placeholder:text-slate-300 text-sm shadow-inner"
                  rows={3}
                  placeholder="用您最舒适的语言描述冥想目标..."
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                />
              </section>

              <section>
                <label className="block text-[10px] font-black text-slate-400 mb-4 uppercase tracking-[0.2em]">
                  ⏱ 时长 / Duration
                </label>
                <div className="flex gap-2">
                  {DURATION_OPTIONS.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setSelectedDuration(d.id)}
                      className={`flex-1 flex flex-col items-center p-3 rounded-2xl border transition-all ${
                        selectedDuration === d.id
                          ? "bg-indigo-50 border-indigo-200 shadow-sm"
                          : "bg-white/40 border-slate-50 hover:border-indigo-100"
                      }`}
                    >
                      <span className="text-lg mb-0.5">{d.icon}</span>
                      <span className="text-[10px] font-bold text-slate-600">
                        {d.label}
                      </span>
                      <span className="text-[8px] text-slate-400">
                        {d.description}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <button
                  onClick={() => setShowPersonalization(!showPersonalization)}
                  className="w-full flex items-center justify-between text-[10px] font-black text-slate-400 mb-4 uppercase tracking-[0.2em] hover:text-indigo-500 transition-colors"
                >
                  <span className="flex items-center">
                    <Settings className="w-4 h-4 mr-2" /> 个性化定制 /
                    Personalize
                  </span>
                  <span
                    className={`text-xs transition-transform ${showPersonalization ? "rotate-180" : ""}`}
                  >
                    ▼
                  </span>
                </button>

                {showPersonalization && (
                  <div className="space-y-4 animate-in slide-in-from-top-2">
                    {/* 经验等级 */}
                    <div>
                      <div className="text-[9px] text-slate-400 font-bold mb-2">
                        🧘 冥想经验
                      </div>
                      <div className="flex gap-2">
                        {EXPERIENCE_OPTIONS.map((e) => (
                          <button
                            key={e.id}
                            onClick={() => setSelectedExperience(e.id)}
                            className={`flex-1 flex flex-col items-center p-2.5 rounded-xl border transition-all text-center ${
                              selectedExperience === e.id
                                ? "bg-violet-50 border-violet-200 shadow-sm"
                                : "bg-white/40 border-slate-50 hover:border-violet-100"
                            }`}
                          >
                            <span className="text-base mb-0.5">{e.icon}</span>
                            <span className="text-[9px] font-bold text-slate-600">
                              {e.label}
                            </span>
                            <span className="text-[7px] text-slate-400">
                              {e.description}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 当前情绪 */}
                    <div>
                      <div className="text-[9px] text-slate-400 font-bold mb-2">
                        💭 当前情绪
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {MOOD_OPTIONS.map((m) => (
                          <button
                            key={m.id}
                            onClick={() => setSelectedMood(m.id)}
                            className={`px-3 py-1.5 rounded-full border text-[9px] font-bold transition-all ${
                              selectedMood === m.id
                                ? "bg-amber-50 border-amber-200 text-amber-700"
                                : "bg-white/40 border-slate-50 text-slate-500 hover:border-amber-100"
                            }`}
                          >
                            {m.icon} {m.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 冥想风格 */}
                    <div>
                      <div className="text-[9px] text-slate-400 font-bold mb-2">
                        ✨ 冥想风格
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {STYLE_OPTIONS.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => setSelectedStyle(s.id)}
                            className={`flex items-center p-2.5 rounded-xl border transition-all ${
                              selectedStyle === s.id
                                ? "bg-emerald-50 border-emerald-200 shadow-sm"
                                : "bg-white/40 border-slate-50 hover:border-emerald-100"
                            }`}
                          >
                            <span className="text-base mr-2">{s.icon}</span>
                            <span className="text-[9px] font-bold text-slate-600">
                              {s.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </section>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <section>
                  <label className="block text-[10px] font-black text-slate-400 mb-4 uppercase tracking-[0.2em]">
                    引导师 / Guide
                  </label>
                  <div className="space-y-2">
                    {VOICES.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => setSelectedVoice(v.id)}
                        className={`w-full flex items-center p-3 rounded-2xl border transition-all ${
                          selectedVoice === v.id
                            ? "bg-indigo-600 border-indigo-600 text-white shadow-lg"
                            : "bg-white/40 border-slate-50 text-slate-500 hover:border-indigo-100"
                        }`}
                      >
                        <div className="text-left flex-1 pl-2">
                          <div className="text-xs font-bold">{v.name}</div>
                        </div>
                        {selectedVoice === v.id && (
                          <Zap className="w-3 h-3 fill-current text-indigo-300" />
                        )}
                      </button>
                    ))}
                  </div>
                </section>

                <section>
                  <label className="block text-[10px] font-black text-slate-400 mb-4 uppercase tracking-[0.2em]">
                    氛围 / Atmosphere
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {BACKGROUND_TRACKS.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedBG(t.id)}
                        className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all ${
                          selectedBG === t.id
                            ? "bg-indigo-50 border-indigo-200 shadow-sm"
                            : "bg-white/40 border-slate-50 hover:border-indigo-100"
                        }`}
                      >
                        <span className="text-xl mb-1">{t.icon}</span>
                        <span className="text-[9px] font-bold text-slate-400">
                          {t.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              </div>

              <div className="pt-4">
                <button
                  disabled={
                    status !== GenerationStatus.IDLE &&
                    status !== GenerationStatus.COMPLETED &&
                    status !== GenerationStatus.ERROR
                  }
                  onClick={handleGenerate}
                  className={`w-full py-5 rounded-full font-bold text-md shadow-lg flex items-center justify-center transition-all ${
                    status === GenerationStatus.IDLE ||
                    status === GenerationStatus.COMPLETED ||
                    status === GenerationStatus.ERROR
                      ? "bg-slate-900 text-white hover:bg-black hover:-translate-y-0.5 shadow-slate-300"
                      : "bg-slate-100 text-slate-400 cursor-not-allowed shadow-none"
                  }`}
                >
                  {status === GenerationStatus.IDLE ||
                  status === GenerationStatus.COMPLETED ||
                  status === GenerationStatus.ERROR ? (
                    <>
                      <RefreshCw className="w-5 h-5 mr-3" /> 生成专属冥想
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-5 h-5 mr-3 animate-spin" />{" "}
                      {progress}% 处理中
                    </>
                  )}
                </button>
              </div>

              {/* 内容库入口 */}
              {history.length > 0 && (
                <button
                  onClick={() => setShowLibrary(true)}
                  className="w-full py-3.5 rounded-2xl border border-slate-100 bg-white/40 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-100 transition-all flex items-center justify-center gap-2 text-sm font-medium"
                >
                  <BookOpen className="w-4 h-4" />
                  内容库
                  <span className="px-2 py-0.5 bg-indigo-50 text-indigo-500 text-[10px] font-bold rounded-full">
                    {history.length}
                  </span>
                </button>
              )}

              {/* 动态进度条 */}
              {status !== GenerationStatus.IDLE &&
                status !== GenerationStatus.COMPLETED &&
                status !== GenerationStatus.ERROR && (
                  <div className="text-center">
                    <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest animate-pulse mb-3 h-4">
                      {LOADING_MESSAGES[loadingMsgIdx]}
                    </p>
                    <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 transition-all duration-700 ease-out shadow-[0_0_8px_rgba(79,70,229,0.4)]"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

              {status === GenerationStatus.ERROR && (
                <div className="flex items-center justify-center p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-medium border border-red-100">
                  <AlertCircle className="w-4 h-4 mr-2" /> 生成异常，请确保 API
                  密钥已正确配置并重试。
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 展示区 */}
        <div className="lg:col-span-7 space-y-12 order-1 lg:order-2">
          {result ? (
            <div className="animate-in fade-in zoom-in-95 duration-700">
              <div className="glass p-12 md:p-20 rounded-[4rem] shadow-xl relative overflow-hidden bg-white/40 border border-white/60">
                <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 to-teal-400"></div>

                <div className="flex flex-col items-center">
                  <div className="relative mb-12">
                    <div
                      className={`absolute -inset-10 bg-indigo-500/5 rounded-full blur-[60px] transition-all duration-1000 ${isPlaying ? "opacity-100 scale-125 animate-pulse" : "opacity-0 scale-90"}`}
                    ></div>
                    <button
                      onClick={togglePlay}
                      className="relative w-36 h-36 md:w-44 md:h-44 bg-slate-900 rounded-full flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition-all group overflow-hidden"
                    >
                      {isPlaying ? (
                        <Pause className="w-12 h-12 text-white fill-current" />
                      ) : (
                        <Play className="w-12 h-12 text-white ml-2 fill-current" />
                      )}
                    </button>
                  </div>

                  <h3 className="text-3xl md:text-5xl font-serif font-bold text-slate-900 mb-6 tracking-tight text-center px-4 leading-tight">
                    {result.script.title}
                  </h3>
                  <div className="flex items-center space-x-2 text-slate-400 mb-10">
                    <Leaf className="w-3.5 h-3.5 text-teal-400" />
                    <span className="text-[10px] font-bold tracking-[0.1em] uppercase">
                      Healing Journey Active
                    </span>
                  </div>

                  <AudioVisualizer isPlaying={isPlaying} audioRef={audioRef} />
                  <audio
                    ref={audioRef}
                    src={
                      result.audioBlob
                        ? URL.createObjectURL(result.audioBlob)
                        : ""
                    }
                    onEnded={() => setIsPlaying(false)}
                    className="hidden"
                  />

                  <div className="flex flex-wrap justify-center gap-4 mt-16">
                    <button
                      onClick={() =>
                        downloadAudio(result.audioBlob!, result.script.title)
                      }
                      className="px-8 py-4 bg-indigo-600 text-white font-bold rounded-full shadow-lg hover:bg-indigo-700 transition-all flex items-center text-sm"
                    >
                      <Download className="w-4 h-4 mr-2" /> 导出 WAV 高品质音频
                    </button>
                    <button
                      onClick={() => {
                        setResult(null);
                        setStatus(GenerationStatus.IDLE);
                      }}
                      className="px-8 py-4 bg-white text-slate-400 font-bold rounded-full border border-slate-100 hover:bg-slate-50 transition-all text-sm"
                    >
                      生成新篇章
                    </button>
                  </div>
                </div>
              </div>

              {/* 剧本预览 */}
              <div className="mt-12 glass p-10 md:p-16 rounded-[3rem] border border-white/40 shadow-sm">
                <h4 className="text-[10px] font-black text-slate-300 mb-10 flex items-center uppercase tracking-[0.4em]">
                  <Wind className="w-4 h-4 mr-3 text-indigo-500" /> 剧本细节 /
                  Script
                </h4>
                <div className="space-y-10">
                  {result.script.sections.map((section, idx) => (
                    <div
                      key={idx}
                      className="relative pl-8 border-l-2 border-slate-100 hover:border-indigo-200 transition-colors"
                    >
                      <div className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-slate-200 border-2 border-white"></div>
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">
                          {section.type}
                        </span>
                        <span className="text-[9px] text-slate-300 italic font-medium">
                          静默 {section.pauseSeconds}s
                        </span>
                      </div>
                      <p className="text-slate-500 text-lg leading-relaxed font-light italic">
                        “{section.content}”
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-[500px] md:h-[650px] flex flex-col items-center justify-center p-12 bg-white/5 rounded-[4rem] border-2 border-dashed border-slate-200/50 animate-in fade-in duration-1000">
              <div className="w-20 h-20 bg-white/80 rounded-full flex items-center justify-center shadow-sm mb-8 relative">
                <div className="absolute inset-0 bg-indigo-100 rounded-full animate-ping opacity-20"></div>
                <Volume2 className="w-8 h-8 text-slate-300" />
              </div>
              <h3 className="text-2xl font-serif font-bold text-slate-400 mb-4 tracking-tight">
                静候佳音
              </h3>
              <p className="text-slate-400/60 max-w-xs text-center leading-relaxed text-sm font-light">
                请输入您的冥想意图，ZenAI 将为您编织一段专属的深度放松之旅。
              </p>
            </div>
          )}
        </div>
      </div>

      <footer className="mt-24 text-center text-slate-400 text-[10px] font-bold tracking-[0.2em] uppercase pb-10 opacity-60">
        © 2025 ZenAI Studio • Powered by Google Gemini
      </footer>

      {/* 内容库抽屉 */}
      <ContentLibrary
        isOpen={showLibrary}
        onClose={() => setShowLibrary(false)}
        history={history}
        onDelete={handleDeleteFromHistory}
        onDownload={downloadAudio}
      />
    </div>
  );
};

export default App;
