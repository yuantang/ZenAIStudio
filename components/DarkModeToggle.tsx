import React, { useState, useEffect } from "react";

type ThemeMode = "light" | "dark" | "system";

/**
 * 深色模式切换组件
 * - 支持三种模式：浅色 / 深色 / 跟随系统
 * - 持久化到 localStorage
 * - 监听系统偏好变化
 */
export const DarkModeToggle: React.FC = () => {
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "system";
    return (localStorage.getItem("zenai_theme") as ThemeMode) || "system";
  });

  useEffect(() => {
    const applyTheme = (m: ThemeMode) => {
      const root = document.documentElement;
      if (
        m === "dark" ||
        (m === "system" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches)
      ) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    };

    applyTheme(mode);
    localStorage.setItem("zenai_theme", mode);

    // 监听系统偏好变化
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (mode === "system") applyTheme("system");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode]);

  const cycleMode = () => {
    setMode((prev) => {
      if (prev === "light") return "dark";
      if (prev === "dark") return "system";
      return "light";
    });
  };

  const icon = mode === "light" ? "☀️" : mode === "dark" ? "🌙" : "🖥️";
  const label = mode === "light" ? "浅色" : mode === "dark" ? "深色" : "系统";

  return (
    <button
      onClick={cycleMode}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 text-[9px] font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
      title={`当前: ${label}`}
    >
      <span className="text-sm">{icon}</span>
      <span>{label}</span>
    </button>
  );
};
