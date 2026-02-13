import React, { useMemo } from "react";
import { MeditationResult } from "../types";

interface MeditationStatsProps {
  isOpen: boolean;
  onClose: () => void;
  history: MeditationResult[];
}

/**
 * 冥想数据追踪面板 — 统计累计时长、连续天数、偏好分析
 */
export const MeditationStats: React.FC<MeditationStatsProps> = ({
  isOpen,
  onClose,
  history,
}) => {
  const stats = useMemo(() => {
    if (history.length === 0) return null;

    // 累计时长（分钟）
    const totalMinutes = history.reduce(
      (sum, h) => sum + (h.duration || 10),
      0,
    );

    // 按日期分组统计
    const daySet = new Set(
      history.map((h) => new Date(h.createdAt).toDateString()),
    );
    const totalDays = daySet.size;

    // 连续天数计算
    const sortedDays = Array.from(daySet)
      .map((d) => new Date(d as string).getTime())
      .sort((a, b) => b - a);

    let streak = 1;
    const today = new Date().setHours(0, 0, 0, 0);
    const msPerDay = 86400000;

    // 检查今天或昨天是否有记录
    const mostRecent = sortedDays[0];
    const daysSinceLast = Math.floor((today - mostRecent) / msPerDay);
    if (daysSinceLast > 1) {
      streak = 0;
    } else {
      for (let i = 1; i < sortedDays.length; i++) {
        const diff = Math.floor((sortedDays[i - 1] - sortedDays[i]) / msPerDay);
        if (diff === 1) {
          streak++;
        } else {
          break;
        }
      }
    }

    // 主题词频分析
    const themeCounts: Record<string, number> = {};
    history.forEach((h) => {
      const words = h.theme.split(/\s+/).filter((w) => w.length > 1);
      words.forEach((w) => {
        themeCounts[w] = (themeCounts[w] || 0) + 1;
      });
    });
    const topThemes = Object.entries(themeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    // 时段分布
    const hourBuckets = { morning: 0, afternoon: 0, evening: 0, night: 0 };
    history.forEach((h) => {
      const hour = new Date(h.createdAt).getHours();
      if (hour >= 5 && hour < 12) hourBuckets.morning++;
      else if (hour >= 12 && hour < 17) hourBuckets.afternoon++;
      else if (hour >= 17 && hour < 21) hourBuckets.evening++;
      else hourBuckets.night++;
    });
    const totalSessions = history.length;
    const peakTime = Object.entries(hourBuckets).sort((a, b) => b[1] - a[1])[0];

    // 最近 7 天活动热力图
    const last7Days: { day: string; count: number; label: string }[] = [];
    const dayNames = ["日", "一", "二", "三", "四", "五", "六"];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today - i * msPerDay);
      const key = d.toDateString();
      const count = history.filter(
        (h) => new Date(h.createdAt).toDateString() === key,
      ).length;
      last7Days.push({
        day: dayNames[d.getDay()],
        count,
        label: `${d.getMonth() + 1}/${d.getDate()}`,
      });
    }

    return {
      totalMinutes,
      totalDays,
      totalSessions,
      streak,
      topThemes,
      hourBuckets,
      peakTime,
      last7Days,
    };
  }, [history]);

  if (!isOpen) return null;

  const peakTimeLabel: Record<string, string> = {
    morning: "🌅 清晨",
    afternoon: "☀️ 午后",
    evening: "🌇 傍晚",
    night: "🌙 深夜",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white/95 backdrop-blur-xl rounded-[2rem] shadow-2xl w-[90vw] max-w-lg max-h-[85vh] overflow-y-auto p-8 animate-in zoom-in-95 fade-in duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            📊 冥想旅程
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl font-bold"
          >
            ×
          </button>
        </div>

        {!stats ? (
          <p className="text-slate-400 text-center py-12 text-sm">
            还没有冥想记录，开始你的第一次冥想吧 🧘
          </p>
        ) : (
          <div className="space-y-6">
            {/* 核心指标卡片 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl p-4 text-center border border-indigo-100/50">
                <div className="text-3xl font-black text-indigo-600">
                  {stats.totalMinutes}
                </div>
                <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1">
                  累计分钟
                </div>
              </div>
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-4 text-center border border-amber-100/50">
                <div className="text-3xl font-black text-amber-600">
                  {stats.streak}
                  <span className="text-lg">🔥</span>
                </div>
                <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1">
                  连续天数
                </div>
              </div>
              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-4 text-center border border-emerald-100/50">
                <div className="text-3xl font-black text-emerald-600">
                  {stats.totalSessions}
                </div>
                <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1">
                  冥想次数
                </div>
              </div>
              <div className="bg-gradient-to-br from-rose-50 to-pink-50 rounded-2xl p-4 text-center border border-rose-100/50">
                <div className="text-3xl font-black text-rose-600">
                  {stats.totalDays}
                </div>
                <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1">
                  活跃天数
                </div>
              </div>
            </div>

            {/* 7 天活动热力图 */}
            <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100/50">
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-3">
                最近 7 天
              </div>
              <div className="flex gap-1.5 justify-between">
                {stats.last7Days.map((d, i) => {
                  const intensity =
                    d.count === 0 ? 0 : Math.min(d.count / 3, 1);
                  return (
                    <div
                      key={i}
                      className="flex-1 flex flex-col items-center gap-1"
                    >
                      <div
                        className="w-full aspect-square rounded-lg transition-colors"
                        style={{
                          backgroundColor:
                            d.count === 0
                              ? "#f1f5f9"
                              : `hsla(230, 70%, 55%, ${0.2 + intensity * 0.6})`,
                        }}
                        title={`${d.label}: ${d.count} 次`}
                      />
                      <span className="text-[8px] text-slate-400 font-bold">
                        {d.day}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 偏好分析 */}
            <div className="grid grid-cols-2 gap-3">
              {/* 常用主题词 */}
              <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100/50">
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-3">
                  热门主题
                </div>
                <div className="flex flex-wrap gap-1">
                  {stats.topThemes.map(([word, count]) => (
                    <span
                      key={word}
                      className="px-2 py-0.5 bg-indigo-50 text-indigo-500 rounded-full text-[8px] font-bold border border-indigo-100/50"
                    >
                      {word} ×{count}
                    </span>
                  ))}
                  {stats.topThemes.length === 0 && (
                    <span className="text-[9px] text-slate-300">暂无数据</span>
                  )}
                </div>
              </div>

              {/* 偏好时段 */}
              <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100/50">
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-3">
                  偏好时段
                </div>
                <div className="text-center">
                  <div className="text-2xl mb-1">
                    {stats.peakTime ? peakTimeLabel[stats.peakTime[0]] : "—"}
                  </div>
                  <div className="text-[8px] text-slate-400">
                    共 {stats.peakTime ? stats.peakTime[1] : 0} 次
                  </div>
                </div>
              </div>
            </div>

            {/* 里程碑 */}
            <div className="bg-gradient-to-r from-indigo-50/50 to-violet-50/50 rounded-2xl p-4 border border-indigo-100/30">
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                🏆 里程碑
              </div>
              <div className="flex flex-wrap gap-2">
                {stats.totalSessions >= 1 && (
                  <span className="px-2 py-1 bg-white/80 rounded-lg text-[9px] font-bold text-emerald-600 shadow-sm">
                    ✅ 初次冥想
                  </span>
                )}
                {stats.totalSessions >= 7 && (
                  <span className="px-2 py-1 bg-white/80 rounded-lg text-[9px] font-bold text-indigo-600 shadow-sm">
                    🌟 一周达人
                  </span>
                )}
                {stats.totalMinutes >= 60 && (
                  <span className="px-2 py-1 bg-white/80 rounded-lg text-[9px] font-bold text-amber-600 shadow-sm">
                    ⏱ 一小时
                  </span>
                )}
                {stats.streak >= 3 && (
                  <span className="px-2 py-1 bg-white/80 rounded-lg text-[9px] font-bold text-rose-600 shadow-sm">
                    🔥 三日连续
                  </span>
                )}
                {stats.streak >= 7 && (
                  <span className="px-2 py-1 bg-white/80 rounded-lg text-[9px] font-bold text-purple-600 shadow-sm">
                    💎 七日禅修
                  </span>
                )}
                {stats.totalMinutes >= 300 && (
                  <span className="px-2 py-1 bg-white/80 rounded-lg text-[9px] font-bold text-teal-600 shadow-sm">
                    🧘 五小时大师
                  </span>
                )}
                {stats.totalSessions < 7 &&
                  stats.totalMinutes < 60 &&
                  stats.streak < 3 && (
                    <span className="text-[9px] text-slate-400 italic">
                      继续冥想，解锁更多里程碑...
                    </span>
                  )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
