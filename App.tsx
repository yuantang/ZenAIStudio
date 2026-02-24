import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Sparkles,
  Wind,
  Volume2,
  Download,
  Play,
  Pause,
  RefreshCw,
  ShieldCheck,
  Zap,
  Leaf,
  MessageSquare,
  AlertCircle,
  Settings,
  X,
  CheckCircle2,
  Key,
  BookOpen,
  BarChart3,
  GraduationCap,
} from "lucide-react";
import {
  GenerationStatus,
  MeditationResult,
  ExperienceLevel,
  MoodState,
  MeditationStyle,
  MeditationCourse,
  CourseDay,
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
  synthesizeFullMeditation,
  getApiKey,
} from "./services/geminiService";
import { decodePcm, mixSingleVoiceAudio } from "./services/audioService";
import { AudioVisualizer } from "./components/AudioVisualizer";
import { ContentLibrary } from "./components/ContentLibrary";
import { VisualAmbience } from "./components/VisualAmbience";
import { MeditationStats } from "./components/MeditationStats";
import { CourseCatalog } from "./components/CourseCatalog";
import { AudioProgressBar } from "./components/AudioProgressBar";
import { DarkModeToggle } from "./components/DarkModeToggle";

const LOADING_MESSAGES = [
  "正在对齐您的呼吸节奏...",
  "正在构筑宁静的心灵意象...",
  "正在邀请资深引导师入场...",
  "正在为您调制自然的背景声场...",
  "每一颗粒子都在为您安静下来...",
  "深呼吸，美好的音频即将呈现...",
];

const HISTORY_KEY = "zenai_meditation_history";
const COURSE_PROGRESS_KEY = "zenai_course_progress";

const loadHistoryFromStorage = (): MeditationResult[] => {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.map((item: any) => ({
      ...item,
      audioBlob: item.audioBase64
        ? base64ToBlob(item.audioBase64, "audio/wav")
        : null,
    }));
  } catch (e) {
    console.error("Failed to load history:", e);
    return [];
  }
};

const saveHistoryToStorage = async (history: MeditationResult[]) => {
  try {
    const historyToSave = await Promise.all(
      history.map(async (item) => {
        const { audioBlob, ...rest } = item;
        const audioBase64 = audioBlob ? await blobToBase64(audioBlob) : null;
        return { ...rest, audioBase64 };
      }),
    );
    localStorage.setItem(HISTORY_KEY, JSON.stringify(historyToSave));
  } catch (e) {
    console.error("Failed to save history:", e);
  }
};

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const base64ToBlob = (base64: string, type: string): Blob => {
  const binary = atob(base64.split(",")[1]);
  const array = [];
  for (let i = 0; i < binary.length; i++) {
    array.push(binary.charCodeAt(i));
  }
  return new Blob([new Uint8Array(array)], { type });
};

const App: React.FC = () => {
  const [theme, setTheme] = useState("");
  const [selectedBG, setSelectedBG] = useState(BACKGROUND_TRACKS[0].id);
  const [selectedVoice, setSelectedVoice] = useState("Zephyr");
  const [selectedDuration, setSelectedDuration] = useState(10);
  const [selectedExperience, setSelectedExperience] =
    useState<ExperienceLevel>("beginner");
  const [selectedMood, setSelectedMood] = useState<MoodState>("neutral");
  const [selectedStyle, setSelectedStyle] =
    useState<MeditationStyle>("mindfulness");
  const [showPersonalization, setShowPersonalization] = useState(false);
  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [progress, setProgress] = useState(0);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [mixingStage, setMixingStage] = useState("");
  const [result, setResult] = useState<MeditationResult | null>(null);
  const [errorInfo, setErrorInfo] = useState<string | null>(null);
  const [history, setHistory] = useState<MeditationResult[]>(() =>
    loadHistoryFromStorage(),
  );
  const [showLibrary, setShowLibrary] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showCourses, setShowCourses] = useState(false);
  const [completedDays, setCompletedDays] = useState<Record<string, number[]>>(
    () => {
      try {
        const raw = localStorage.getItem(COURSE_PROGRESS_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch {
        return {};
      }
    },
  );

  // 密钥配置状态
  const [showSettings, setShowSettings] = useState(false);
  const [tempApiKey, setTempApiKey] = useState("");
  const [currentApiKey, setCurrentApiKey] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioUrl, setAudioUrl] = useState<string>("");

  useEffect(() => {
    if (result) {
      const url = URL.createObjectURL(result.audioBlob);
      setAudioUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setAudioUrl("");
    }
  }, [result]);

  useEffect(() => {
    setCurrentApiKey(getApiKey());

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

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 忽略输入框内的按键
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.code === "Space") {
        e.preventDefault();
        if (result) togglePlay();
      } else if (e.code === "Escape") {
        if (showSettings) setShowSettings(false);
        else if (showLibrary) setShowLibrary(false);
        else if (showStats) setShowStats(false);
        else if (showCourses) setShowCourses(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [result, showSettings, showLibrary, showStats, showCourses]);

  const saveApiKey = () => {
    if (tempApiKey.trim()) {
      localStorage.setItem("ZENAI_API_KEY", tempApiKey.trim());
      setCurrentApiKey(tempApiKey.trim());
      setShowSettings(false);
      setTempApiKey("");
    }
  };

  const clearApiKey = () => {
    localStorage.removeItem("ZENAI_API_KEY");
    setCurrentApiKey(getApiKey());
    setShowSettings(false);
  };

  const handleSelectCourseDay = useCallback(
    (course: MeditationCourse, day: CourseDay) => {
      setTheme(day.theme);
      setSelectedDuration(day.durationMinutes);
      setShowCourses(false);
    },
    [],
  );

  const markCourseDay = useCallback((courseId: string, dayNum: number) => {
    setCompletedDays((prev) => {
      const next = { ...prev };
      const days = next[courseId] || [];
      if (!days.includes(dayNum)) {
        next[courseId] = [...days, dayNum];
      }
      localStorage.setItem(COURSE_PROGRESS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const processSingleItem = async (currentTheme: string) => {
    setErrorInfo(null);
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
      (stage, mixPercent) => {
        // 混音阶段映射到总进度的 80%~97%
        const mappedProgress = 80 + Math.floor(mixPercent * 0.17);
        setProgress(mappedProgress);
        setMixingStage(stage);
      },
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
    if (!currentApiKey) {
      setShowSettings(true);
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
      console.error("生成流程异常:", e);
      setErrorInfo(e.message || "未知内部错误");
      setStatus(GenerationStatus.ERROR);
    }
  };

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) audioRef.current.pause();
      else {
        audioRef.current.play().catch((e) => {
          console.error("Audio playback failed:", e);
          alert("音频播放失败：" + e.message + "，请尝试刷新重发。");
        });
      }
      setIsPlaying(!isPlaying);
    }
  };

  const downloadAudio = (blob: Blob, name: string) => {
    const ext = blob.type.includes("mp3") ? "mp3" : "wav";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const applyPreset = (prompt: string) => {
    setTheme(prompt);
    setErrorInfo(null);
    if (status === GenerationStatus.ERROR) setStatus(GenerationStatus.IDLE);
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
      {/* 设置模态框 */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setShowSettings(false)}
          ></div>
          <div className="relative glass p-8 md:p-10 rounded-[2.5rem] w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-300">
            <button
              onClick={() => setShowSettings(false)}
              className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center mb-8">
              <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
                <Key className="w-8 h-8 text-indigo-500" />
              </div>
              <h3 className="text-2xl font-serif font-bold text-slate-900">
                配置 API Key
              </h3>
              <p className="text-slate-400 text-xs mt-2 text-center leading-relaxed">
                您的 Key 将仅加密存储在浏览器本地缓存中。
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">
                  密钥串
                </label>
                <input
                  type="password"
                  value={tempApiKey}
                  onChange={(e) => setTempApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full px-5 py-4 rounded-2xl border-none ring-1 ring-slate-100 focus:ring-2 focus:ring-indigo-400 outline-none transition-all bg-white shadow-inner text-sm"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={saveApiKey}
                  disabled={!tempApiKey.trim()}
                  className={`flex-1 py-4 rounded-xl font-bold text-sm shadow-md transition-all ${tempApiKey.trim() ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100" : "bg-slate-100 text-slate-300 cursor-not-allowed"}`}
                >
                  保存并启用
                </button>
                {localStorage.getItem("ZENAI_API_KEY") && (
                  <button
                    onClick={clearApiKey}
                    className="px-6 py-4 rounded-xl font-bold text-sm bg-white border border-slate-100 text-red-400 hover:bg-red-50 transition-all"
                  >
                    重置
                  </button>
                )}
              </div>
            </div>
          </div>
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

      <header className="text-center mb-16 md:mb-24 relative">
        <div className="absolute top-0 right-0 flex items-center gap-2">
          <DarkModeToggle />
          <button
            onClick={() => setShowSettings(true)}
            className="p-3 rounded-full bg-white/80 dark:bg-slate-800/80 shadow-sm border border-slate-100 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:text-indigo-500 hover:shadow-md transition-all"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
        <div className="inline-flex items-center px-4 py-2 rounded-full bg-white/80 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-[10px] font-bold tracking-[0.2em] uppercase mb-6 shadow-sm">
          <ShieldCheck className="w-3.5 h-3.5 mr-2 text-indigo-500" />{" "}
          Professional ZenAI Studio
        </div>
        <h1 className="text-5xl md:text-7xl font-serif font-bold text-slate-900 dark:text-white mb-6 tracking-tight">
          ZenAI Studio
        </h1>
        <p className="text-lg md:text-xl text-slate-400 dark:text-slate-500 max-w-2xl mx-auto font-light leading-relaxed px-4">
          由 Gemini 驱动的深度冥想创作系统。
          <br className="hidden md:block" />
          为您定制绝对稳定的疗愈频率。
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
        {/* 控制台 */}
        <div className="lg:col-span-5 space-y-8 order-2 lg:order-1">
          <div className="glass p-8 md:p-12 rounded-[3rem] shadow-xl shadow-slate-200/40 border border-white/50">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-200 mb-8 flex items-center justify-between">
              <span className="flex items-center">
                <Sparkles className="w-5 h-5 mr-3 text-indigo-500" /> 工作台配置
              </span>
              <div
                className={`flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-bold transition-all ${currentApiKey ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600 cursor-pointer"}`}
                onClick={() => !currentApiKey && setShowSettings(true)}
              >
                {currentApiKey ? (
                  <>
                    <CheckCircle2 className="w-3 h-3" /> API 就绪
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3 h-3" /> 需要配置
                  </>
                )}
              </div>
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
                  onChange={(e) => {
                    setTheme(e.target.value);
                    if (status === GenerationStatus.ERROR)
                      setStatus(GenerationStatus.IDLE);
                  }}
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
                  {!currentApiKey ? (
                    <>
                      <Key className="w-5 h-5 mr-3" /> 请先配置 API Key
                    </>
                  ) : status === GenerationStatus.IDLE ||
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

              {/* 功能入口排 */}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowLibrary(true)}
                  className="flex-1 py-3 rounded-2xl bg-white border border-slate-100 text-slate-500 text-[10px] font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                >
                  <BookOpen className="w-4 h-4" /> 冥想内容库
                </button>
                <button
                  onClick={() => setShowStats(true)}
                  className="flex-1 py-3 rounded-2xl bg-white border border-slate-100 text-slate-500 text-[10px] font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                >
                  <BarChart3 className="w-4 h-4" /> 练习统计
                </button>
                <button
                  onClick={() => setShowCourses(true)}
                  className="flex-1 py-3 rounded-2xl bg-white border border-slate-100 text-slate-500 text-[10px] font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                >
                  <GraduationCap className="w-4 h-4" /> 结构化课程
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 预览区 */}
        <div className="lg:col-span-7 order-1 lg:order-2 self-start sticky top-10">
          {status === GenerationStatus.IDLE && !result && (
            <div className="glass p-16 rounded-[4rem] text-center border-dashed border-2 border-indigo-100/50 flex flex-col items-center">
              <div className="w-20 h-20 bg-indigo-50 rounded-[2rem] flex items-center justify-center mb-8 animate-pulse">
                <Wind className="w-10 h-10 text-indigo-200" />
              </div>
              <h3 className="text-2xl font-serif text-slate-400 font-light mb-4">
                准备好开始了吗？
              </h3>
              <p className="text-slate-300 text-sm max-w-xs leading-relaxed">
                描述您的心境，让 AI 为您编织
                <br />
                长达 20 分钟的深度沉浸式冥想。
              </p>
            </div>
          )}

          {/* 沉浸式生成进度面板 */}
          {(status === GenerationStatus.WRITING ||
            status === GenerationStatus.VOICING ||
            status === GenerationStatus.MIXING ||
            status === GenerationStatus.BATCH_PROCESSING) && (
            <div className="glass p-12 md:p-16 rounded-[4rem] shadow-2xl shadow-indigo-100/50 relative overflow-hidden">
              {/* 呼吸脉冲背景 */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-64 h-64 bg-indigo-100/20 rounded-full blur-3xl breathing-glow"></div>
              </div>

              <div className="relative z-10 text-center">
                {/* 旋转加载图标 */}
                <div className="mb-8 inline-flex">
                  <div className="w-20 h-20 bg-gradient-to-br from-indigo-50 to-violet-50 rounded-[2rem] flex items-center justify-center shadow-lg">
                    <RefreshCw
                      className="w-8 h-8 text-indigo-400 animate-spin"
                      style={{ animationDuration: "3s" }}
                    />
                  </div>
                </div>

                {/* 阶段标题 */}
                <h3 className="text-2xl font-serif font-bold text-slate-800 mb-3">
                  {status === GenerationStatus.WRITING && "✍️ 正在撰写冥想剧本"}
                  {status === GenerationStatus.VOICING && "🎤 正在合成引导语音"}
                  {status === GenerationStatus.MIXING && "🎛️ 正在混音母带处理"}
                  {status === GenerationStatus.BATCH_PROCESSING &&
                    "📦 批量处理中"}
                </h3>

                {/* 混音子阶段 */}
                {status === GenerationStatus.MIXING && mixingStage && (
                  <p className="text-indigo-500 text-xs font-bold mb-6 tracking-wide">
                    {mixingStage}
                  </p>
                )}

                {/* 进度条 */}
                <div className="max-w-xs mx-auto mb-6">
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-400 to-violet-500 rounded-full transition-all duration-700 ease-out"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between mt-2">
                    <span className="text-[9px] text-slate-400 font-bold">
                      {progress}%
                    </span>
                    <span className="text-[9px] text-slate-400">
                      {status === GenerationStatus.WRITING && "剧本生成"}
                      {status === GenerationStatus.VOICING && "语音合成"}
                      {status === GenerationStatus.MIXING && "混音渲染"}
                      {status === GenerationStatus.BATCH_PROCESSING &&
                        "批量处理"}
                    </span>
                  </div>
                </div>

                {/* 轮播提示语 */}
                <p className="text-sm text-slate-400 font-light animate-pulse">
                  {LOADING_MESSAGES[loadingMsgIdx]}
                </p>
              </div>
            </div>
          )}

          {status === GenerationStatus.ERROR && (
            <div className="glass p-12 rounded-[3rem] text-center border-red-100 border-2">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-6" />
              <h3 className="text-xl font-bold text-red-500 mb-2">
                生成遇到了一点阻碍
              </h3>
              <p className="text-red-400 text-sm mb-8 px-4">
                {errorInfo || "可能是由于网络波动或 API 限流。"}
              </p>
              <button
                onClick={handleGenerate}
                className="px-8 py-3 bg-red-50 text-red-500 rounded-full text-sm font-bold hover:bg-red-500 hover:text-white transition-all"
              >
                重试生成
              </button>
            </div>
          )}

          {result && (
            <div className="glass p-10 md:p-16 rounded-[4rem] shadow-2xl shadow-indigo-100/50 relative overflow-hidden group">
              {/* 可视化背景 */}
              <VisualAmbience
                isPlaying={isPlaying}
                hint={result.script.sections[0]?.ambientHint}
              />

              <div className="relative z-10 text-center">
                <div className="mb-12 inline-flex relative p-8">
                  <div className="absolute inset-0 bg-indigo-100/30 rounded-full scale-150 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
                  <button
                    onClick={togglePlay}
                    className="w-28 h-28 bg-slate-900 rounded-full flex items-center justify-center text-white shadow-2xl hover:scale-105 transition-transform relative z-20 group/play"
                  >
                    {isPlaying ? (
                      <Pause className="w-10 h-10 group-hover/play:scale-95 transition-transform" />
                    ) : (
                      <Play className="w-10 h-10 pl-2 group-hover/play:scale-110 transition-transform" />
                    )}
                  </button>
                </div>

                <h3 className="text-3xl font-serif font-black text-slate-900 dark:text-white mb-4 tracking-tight">
                  {result.script.title}
                </h3>
                <div className="text-indigo-500 text-[10px] font-black tracking-widest uppercase mb-12 flex items-center justify-center gap-3">
                  <span className="w-8 h-px bg-indigo-100"></span>
                  {(result.audioBlob.size / 1024 / 1024).toFixed(1)} MB{" "}
                  {result.audioBlob.type.includes("mp3") ? "MP3" : "WAV"} •{" "}
                  {selectedDuration} MIN SESSION
                  <span className="w-8 h-px bg-indigo-100"></span>
                </div>

                <div className="mb-6">
                  <AudioVisualizer
                    audioRef={audioRef}
                    isPlaying={isPlaying}
                    color="#6366f1"
                  />
                </div>

                <div className="mb-10 px-4">
                  <AudioProgressBar audioRef={audioRef} isPlaying={isPlaying} />
                </div>

                <div className="flex justify-center gap-4">
                  <button
                    onClick={() =>
                      downloadAudio(result.audioBlob, result.script.title)
                    }
                    className="px-8 py-4 bg-white border border-slate-100 text-slate-900 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 hover:shadow-lg transition-all flex items-center gap-3"
                  >
                    <Download className="w-4 h-4" /> 下载音频
                  </button>
                  <button
                    onClick={() => {
                      setResult(null);
                      setStatus(GenerationStatus.IDLE);
                    }}
                    className="px-8 py-4 bg-slate-50 text-slate-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white hover:text-slate-600 transition-all"
                  >
                    重新生成
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="mt-32 text-center text-slate-300">
        <div className="w-16 h-px bg-slate-100 mx-auto mb-8"></div>
        <p className="text-[10px] uppercase tracking-[0.3em] font-medium">
          Pure Healing Experience • Powered by DeepMind
        </p>
      </footer>

      {/* 音频标签及其事件处理 */}
      {result && (
        <audio
          ref={audioRef}
          src={audioUrl || ""}
          preload="auto"
          onError={(e) => {
            console.error("Audio Element Error:", e.currentTarget.error);
            alert(
              "音频加载失败：" + (e.currentTarget.error?.message || "未知错误"),
            );
          }}
          onEnded={() => {
            setIsPlaying(false);
            // 如果是在课程中生成的，标记该天完成
            const currentCourse = MEDITATION_PRESETS.find(
              (p) => p.prompt === theme,
            ) as any;
            if (currentCourse?.courseId) {
              markCourseDay(currentCourse.courseId, currentCourse.dayNum);
            }
          }}
          className="hidden"
        />
      )}

      {/* 弹窗组件 */}
      <ContentLibrary
        isOpen={showLibrary}
        onClose={() => setShowLibrary(false)}
        history={history}
        onDelete={handleDeleteFromHistory}
      />

      <MeditationStats
        isOpen={showStats}
        onClose={() => setShowStats(false)}
        history={history}
      />

      <CourseCatalog
        isOpen={showCourses}
        onClose={() => setShowCourses(false)}
        completedDays={completedDays}
        onSelectDay={handleSelectCourseDay}
      />
    </div>
  );
};

export default App;
