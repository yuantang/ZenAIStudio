import React, { useState, useEffect } from "react";
import { X, Key, Shield, AlertCircle } from "lucide-react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [geminiKey, setGeminiKey] = useState("");
  const [dashscopeKey, setDashscopeKey] = useState("");
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setGeminiKey(localStorage.getItem("zenai_gemini_api_key") || "");
      setDashscopeKey(localStorage.getItem("zenai_dashscope_api_key") || "");
      setIsSaved(false);
      // 禁止背景滚动
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    localStorage.setItem("zenai_gemini_api_key", geminiKey.trim());
    localStorage.setItem("zenai_dashscope_api_key", dashscopeKey.trim());
    setIsSaved(true);
    setTimeout(() => {
      onClose();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
      <div className="fixed inset-0" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl overflow-hidden p-6 sm:p-10 animate-fade-in-up">
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-500"
        >
          <X size={20} />
        </button>

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-tr from-amber-100 to-orange-100 dark:from-zinc-800 dark:to-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm border border-amber-200/50 dark:border-zinc-700/50">
            <Key
              className="text-amber-600 dark:text-amber-400"
              size={32}
              strokeWidth={1.5}
            />
          </div>
          <h2 className="text-2xl font-bold text-zinc-800 dark:text-zinc-100">
            核心配置
          </h2>
          <p className="text-sm text-zinc-500 mt-2">
            API 密钥仅存储在您的浏览器本地，不会上传至任何服务器。
          </p>
        </div>

        <div className="space-y-6">
          {/* Gemini API Key */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              Google Gemini API Key
            </label>
            <input
              type="password"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="AI 剧本生成依赖此 Key (如 AI Studio 申请的密钥)"
              className="w-full px-4 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-mono text-sm placeholder:font-sans placeholder:text-zinc-400"
            />
          </div>

          {/* DashScope API Key */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-500"></span>
              阿里云 DashScope API Key
            </label>
            <input
              type="password"
              value={dashscopeKey}
              onChange={(e) => setDashscopeKey(e.target.value)}
              placeholder="Qwen/CosyVoice 语音服务依赖此 Key"
              className="w-full px-4 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all font-mono text-sm placeholder:font-sans placeholder:text-zinc-400"
            />
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 flex gap-3 text-blue-800 dark:text-blue-300 text-sm border border-blue-100 dark:border-blue-800/30">
            <Shield className="shrink-0 mt-0.5" size={18} />
            <p className="leading-relaxed">
              您的密钥已采用 LocalStorage 隔离存储。如果部署在公网
              Vercel，留空时系统将尝试读取默认环境变量配置。
            </p>
          </div>
        </div>

        <div className="mt-10">
          <button
            onClick={handleSave}
            className={`w-full py-4 rounded-xl font-medium text-lg transition-all duration-300 relative overflow-hidden group ${
              isSaved
                ? "bg-green-500 text-white shadow-lg shadow-green-500/20"
                : "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:scale-[1.02] shadow-xl shadow-black/10"
            }`}
          >
            {isSaved ? "已保存，配置生效 ✅" : "保存设置"}
          </button>
        </div>
      </div>
    </div>
  );
};
