
import React, { useState, useRef, useEffect } from 'react';
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
  Key
} from 'lucide-react';
import { 
  GenerationStatus, 
  MeditationResult
} from './types';
import { BACKGROUND_TRACKS, VOICES, MEDITATION_PRESETS } from './constants';
import { generateMeditationScript, synthesizeSpeech, getApiKey } from './services/geminiService';
import { decodePcm, mixMeditationAudio } from './services/audioService';
import { AudioVisualizer } from './components/AudioVisualizer';

const LOADING_MESSAGES = [
  "正在对齐您的呼吸节奏...",
  "正在构筑宁静的心灵意象...",
  "正在邀请资深引导师入场...",
  "正在为您调制自然的背景声场...",
  "每一颗粒子都在为您安静下来...",
  "深呼吸，美好的音频即将呈现..."
];

const App: React.FC = () => {
  const [theme, setTheme] = useState('');
  const [selectedBG, setSelectedBG] = useState(BACKGROUND_TRACKS[0].id);
  const [selectedVoice, setSelectedVoice] = useState('Zephyr');
  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [progress, setProgress] = useState(0);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [result, setResult] = useState<MeditationResult | null>(null);
  const [errorInfo, setErrorInfo] = useState<string | null>(null);
  const [history, setHistory] = useState<MeditationResult[]>([]);
  
  // 密钥配置状态
  const [showSettings, setShowSettings] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');
  const [currentApiKey, setCurrentApiKey] = useState<string | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    setCurrentApiKey(getApiKey());
    
    let interval: number;
    if (status !== GenerationStatus.IDLE && status !== GenerationStatus.COMPLETED && status !== GenerationStatus.ERROR) {
      interval = window.setInterval(() => {
        setLoadingMsgIdx(prev => (prev + 1) % LOADING_MESSAGES.length);
      }, 3500);
    }
    return () => clearInterval(interval);
  }, [status]);

  const saveApiKey = () => {
    if (tempApiKey.trim()) {
      localStorage.setItem('ZENAI_API_KEY', tempApiKey.trim());
      setCurrentApiKey(tempApiKey.trim());
      setShowSettings(false);
      setTempApiKey('');
    }
  };

  const clearApiKey = () => {
    localStorage.removeItem('ZENAI_API_KEY');
    setCurrentApiKey(getApiKey());
    setShowSettings(false);
  };

  const processSingleItem = async (currentTheme: string) => {
    setErrorInfo(null);
    setStatus(GenerationStatus.WRITING);
    setProgress(5);
    const script = await generateMeditationScript(currentTheme);
    setProgress(20);
    
    setStatus(GenerationStatus.VOICING);
    const voiceBuffers: AudioBuffer[] = [];
    const pauses: number[] = [];
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    for (let i = 0; i < script.sections.length; i++) {
      const section = script.sections[i];
      const rawPcm = await synthesizeSpeech(section.content, selectedVoice);
      const decoded = await decodePcm(rawPcm, ctx);
      voiceBuffers.push(decoded);
      pauses.push(section.pauseSeconds);
      
      const stepProgress = 20 + Math.floor(((i + 1) / script.sections.length) * 65);
      setProgress(stepProgress);
    }
    await ctx.close();

    setStatus(GenerationStatus.MIXING);
    const track = BACKGROUND_TRACKS.find(t => t.id === selectedBG)!;
    const finalBlob = await mixMeditationAudio(voiceBuffers, pauses, track.url);
    
    setProgress(100);
    return {
      id: Math.random().toString(36).substr(2, 9),
      theme: currentTheme,
      script,
      audioBlob: finalBlob,
      createdAt: Date.now()
    };
  };

  const handleGenerate = async () => {
    if (!theme) return;
    if (!currentApiKey) {
      setShowSettings(true);
      return;
    }
    try {
      const res = await processSingleItem(theme);
      setResult(res);
      setHistory(prev => [res, ...prev]);
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
      else audioRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  const downloadAudio = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ZenAI_${name.replace(/\s+/g, '_')}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const applyPreset = (prompt: string) => {
    setTheme(prompt);
    setErrorInfo(null);
    if (status === GenerationStatus.ERROR) setStatus(GenerationStatus.IDLE);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-10 lg:py-20 relative">
      {/* 设置模态框 */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowSettings(false)}></div>
          <div className="relative glass p-8 md:p-10 rounded-[2.5rem] w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-300">
            <button onClick={() => setShowSettings(false)} className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
            
            <div className="flex flex-col items-center mb-8">
              <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
                <Key className="w-8 h-8 text-indigo-500" />
              </div>
              <h3 className="text-2xl font-serif font-bold text-slate-900">配置 API Key</h3>
              <p className="text-slate-400 text-xs mt-2 text-center leading-relaxed">
                您的 Key 将仅加密存储在浏览器本地缓存中。如果频繁遇到 500 错误，请检查 Key 的有效性或余额。
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">密钥串</label>
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
                  className={`flex-1 py-4 rounded-xl font-bold text-sm shadow-md transition-all ${tempApiKey.trim() ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
                >
                  保存并启用
                </button>
                {localStorage.getItem('ZENAI_API_KEY') && (
                  <button 
                    onClick={clearApiKey}
                    className="px-6 py-4 rounded-xl font-bold text-sm bg-white border border-slate-100 text-red-400 hover:bg-red-50 transition-all"
                  >
                    重置
                  </button>
                )}
              </div>
              
              <p className="text-[9px] text-slate-300 text-center pt-2">
                没有 Key? 前往 <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-indigo-400 underline hover:text-indigo-600">Google AI Studio</a> 免费获取。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 背景动态装饰 */}
      <div className="fixed inset-0 -z-10 bg-[#f9fafc] overflow-hidden">
        <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-indigo-100/40 rounded-full blur-[100px] breathing-glow"></div>
        <div className="absolute bottom-[-5%] left-[-5%] w-[500px] h-[500px] bg-teal-50/50 rounded-full blur-[90px] breathing-glow" style={{animationDelay: '2s'}}></div>
      </div>

      <header className="text-center mb-16 md:mb-24 relative">
        <button 
          onClick={() => setShowSettings(true)}
          className="absolute top-0 right-0 p-3 rounded-full bg-white/80 shadow-sm border border-slate-100 text-slate-400 hover:text-indigo-500 hover:shadow-md transition-all"
        >
          <Settings className="w-5 h-5" />
        </button>

        <div className="inline-flex items-center px-4 py-2 rounded-full bg-white/80 border border-slate-100 text-slate-500 text-[10px] font-bold tracking-[0.2em] uppercase mb-6 shadow-sm">
          <ShieldCheck className="w-3.5 h-3.5 mr-2 text-indigo-500" /> Professional ZenAI Studio
        </div>
        <h1 className="text-5xl md:text-7xl font-serif font-bold text-slate-900 mb-6 tracking-tight">
          ZenAI Studio
        </h1>
        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto font-light leading-relaxed px-4">
          由 Gemini 3 Pro 驱动的深度冥想创作系统。<br className="hidden md:block" />为您定制绝对稳定的疗愈频率。
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
                className={`flex items-center gap-2 px-3 py-1 rounded-full text-[9px] font-bold transition-all ${currentApiKey ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600 cursor-pointer'}`}
                onClick={() => !currentApiKey && setShowSettings(true)}
              >
                {currentApiKey ? (
                  <><CheckCircle2 className="w-3 h-3" /> API 就绪</>
                ) : (
                  <><AlertCircle className="w-3 h-3" /> 需要配置</>
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
                    if (status === GenerationStatus.ERROR) setStatus(GenerationStatus.IDLE);
                  }}
                />
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
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' 
                          : 'bg-white/40 border-slate-50 text-slate-500 hover:border-indigo-100'
                        }`}
                      >
                        <div className="text-left flex-1 pl-2">
                          <div className="text-xs font-bold">{v.name}</div>
                        </div>
                        {selectedVoice === v.id && <Zap className="w-3 h-3 fill-current text-indigo-300" />}
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
                          ? 'bg-indigo-50 border-indigo-200 shadow-sm' 
                          : 'bg-white/40 border-slate-50 hover:border-indigo-100'
                        }`}
                      >
                        <span className="text-xl mb-1">{t.icon}</span>
                        <span className="text-[9px] font-bold text-slate-400">{t.name}</span>
                      </button>
                    ))}
                  </div>
                </section>
              </div>

              <div className="pt-4">
                <button
                  disabled={status !== GenerationStatus.IDLE && status !== GenerationStatus.COMPLETED && status !== GenerationStatus.ERROR}
                  onClick={handleGenerate}
                  className={`w-full py-5 rounded-full font-bold text-md shadow-lg flex items-center justify-center transition-all ${
                    status === GenerationStatus.IDLE || status === GenerationStatus.COMPLETED || status === GenerationStatus.ERROR
                    ? 'bg-slate-900 text-white hover:bg-black hover:-translate-y-0.5 shadow-slate-300' 
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
                  }`}
                >
                  {!currentApiKey ? (
                    <><Key className="w-5 h-5 mr-3" /> 请先配置 API Key</>
                  ) : (status === GenerationStatus.IDLE || status === GenerationStatus.COMPLETED || status === GenerationStatus.ERROR ? (
                    <><RefreshCw className="w-5 h-5 mr-3" /> 生成专属冥想</>
                  ) : (
                    <><RefreshCw className="w-5 h-5 mr-3 animate-spin" /> {progress}% 处理中</>
                  ))}
                </button>
              </div>

              {/* 动态进度条 */}
              {(status !== GenerationStatus.IDLE && status !== GenerationStatus.COMPLETED && status !== GenerationStatus.ERROR) && (
                <div className="text-center">
                  <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest animate-pulse mb-3 h-4">
                    {LOADING_MESSAGES[loadingMsgIdx]}
                  </p>
                  <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 transition-all duration-700 ease-out shadow-[0_0_8px_rgba(79,70,229,0.4)]" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}

              {status === GenerationStatus.ERROR && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="p-5 bg-red-50 text-red-600 rounded-[1.5rem] border border-red-100">
                    <div className="flex items-start mb-2">
                      <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold mb-1">服务暂时波动 (Internal Error)</p>
                        <p className="text-[11px] leading-relaxed opacity-80">{errorInfo || "Gemini API 发生了 500 内部错误。这通常是由于服务端负载过高或试验性模型波动引起的。"}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <button 
                        onClick={handleGenerate}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg text-[10px] font-bold hover:bg-red-700 transition-colors"
                      >
                        重新尝试
                      </button>
                      <button 
                        onClick={() => setShowSettings(true)}
                        className="px-4 py-2 bg-white text-red-600 border border-red-100 rounded-lg text-[10px] font-bold hover:bg-red-100 transition-colors"
                      >
                        检查设置
                      </button>
                    </div>
                  </div>
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
                    <div className={`absolute -inset-10 bg-indigo-500/5 rounded-full blur-[60px] transition-all duration-1000 ${isPlaying ? 'opacity-100 scale-125 animate-pulse' : 'opacity-0 scale-90'}`}></div>
                    <button 
                      onClick={togglePlay}
                      className="relative w-36 h-36 md:w-44 md:h-44 bg-slate-900 rounded-full flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition-all group overflow-hidden"
                    >
                      {isPlaying ? <Pause className="w-12 h-12 text-white fill-current" /> : <Play className="w-12 h-12 text-white ml-2 fill-current" />}
                    </button>
                  </div>
                  
                  <h3 className="text-3xl md:text-5xl font-serif font-bold text-slate-900 mb-6 tracking-tight text-center px-4 leading-tight">{result.script.title}</h3>
                  <div className="flex items-center space-x-2 text-slate-400 mb-10">
                    <Leaf className="w-3.5 h-3.5 text-teal-400" />
                    <span className="text-[10px] font-bold tracking-[0.1em] uppercase">Healing Journey Active</span>
                  </div>

                  <AudioVisualizer isPlaying={isPlaying} audioRef={audioRef} />
                  <audio ref={audioRef} src={result.audioBlob ? URL.createObjectURL(result.audioBlob) : ''} onEnded={() => setIsPlaying(false)} className="hidden" />

                  <div className="flex flex-wrap justify-center gap-4 mt-16">
                    <button 
                      onClick={() => downloadAudio(result.audioBlob!, result.script.title)}
                      className="px-8 py-4 bg-indigo-600 text-white font-bold rounded-full shadow-lg hover:bg-indigo-700 transition-all flex items-center text-sm"
                    >
                      <Download className="w-4 h-4 mr-2" /> 导出 WAV 高品质音频
                    </button>
                    <button 
                      onClick={() => { setResult(null); setStatus(GenerationStatus.IDLE); }}
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
                  <Wind className="w-4 h-4 mr-3 text-indigo-500" /> 剧本细节 / Script
                </h4>
                <div className="space-y-10">
                  {result.script.sections.map((section, idx) => (
                    <div key={idx} className="relative pl-8 border-l-2 border-slate-100 hover:border-indigo-200 transition-colors">
                      <div className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-slate-200 border-2 border-white"></div>
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">{section.type}</span>
                        <span className="text-[9px] text-slate-300 italic font-medium">静默 {section.pauseSeconds}s</span>
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
              <h3 className="text-2xl font-serif font-bold text-slate-400 mb-4 tracking-tight">静候佳音</h3>
              <p className="text-slate-400/60 max-w-xs text-center leading-relaxed text-sm font-light">
                请输入您的冥想意图，ZenAI 将为您编织一段专属的深度放松之旅。
              </p>
              {!currentApiKey && (
                <button 
                  onClick={() => setShowSettings(true)}
                  className="mt-8 px-6 py-3 rounded-full bg-indigo-50 text-indigo-600 font-bold text-xs hover:bg-indigo-100 transition-all flex items-center"
                >
                  <Settings className="w-4 h-4 mr-2" /> 配置 API Key 以开始
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      
      <footer className="mt-24 text-center text-slate-400 text-[10px] font-bold tracking-[0.2em] uppercase pb-10 opacity-60">
        © 2025 ZenAI Studio • Powered by Google Gemini
      </footer>
    </div>
  );
};

export default App;
