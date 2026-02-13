import React, { useState } from "react";

export interface CourseDay {
  day: number;
  title: string;
  theme: string;
  focus: string;
  durationMinutes: number;
}

export interface MeditationCourse {
  id: string;
  name: string;
  description: string;
  icon: string;
  level: "beginner" | "intermediate" | "advanced";
  days: CourseDay[];
  color: string;
}

export const COURSES: MeditationCourse[] = [
  {
    id: "7day-calm",
    name: "7日静心入门",
    description: "从零开始，每天10分钟，建立稳固的冥想习惯",
    icon: "🌱",
    level: "beginner",
    color: "emerald",
    days: [
      {
        day: 1,
        title: "觉知呼吸",
        theme:
          "感受呼吸的流动，学习最基础的冥想锚定技巧，专注于一呼一吸之间的宁静",
        focus: "呼吸觉察",
        durationMinutes: 5,
      },
      {
        day: 2,
        title: "身体着陆",
        theme:
          "通过渐进式身体扫描，感受从头顶到脚趾的每一寸肌肤，学会用身体感知当下",
        focus: "身体扫描",
        durationMinutes: 8,
      },
      {
        day: 3,
        title: "五感唤醒",
        theme:
          "依次打开视觉、听觉、触觉、嗅觉、味觉的感知通道，在日常中发现觉知的美",
        focus: "感官觉知",
        durationMinutes: 10,
      },
      {
        day: 4,
        title: "念头观察",
        theme: "学会像看云彩飘过天空一样观察念头的来去，不抓取不评判，只是看着",
        focus: "念头觉察",
        durationMinutes: 10,
      },
      {
        day: 5,
        title: "情绪容器",
        theme:
          "学习将内心想象成一个广阔的容器，温柔地容纳所有情绪，无论喜悦还是悲伤",
        focus: "情绪觉察",
        durationMinutes: 10,
      },
      {
        day: 6,
        title: "行走冥想",
        theme: "将冥想带入行走中，感受脚与大地的每一次接触，在运动中寻找静心",
        focus: "动态觉知",
        durationMinutes: 10,
      },
      {
        day: 7,
        title: "感恩与回望",
        theme:
          "回顾这一周的冥想之旅，向内心的成长致敬，带着感恩的心延续这份平静",
        focus: "感恩冥想",
        durationMinutes: 10,
      },
    ],
  },
  {
    id: "5day-sleep",
    name: "5日安眠计划",
    description: "通过渐进式放松与深度意象，重拾婴儿般的睡眠",
    icon: "🌙",
    level: "beginner",
    color: "indigo",
    days: [
      {
        day: 1,
        title: "松弛指令",
        theme:
          "从头皮到脚趾的全身肌肉渐进式放松，让每一块紧绷的肌肉都收到松弛的指令",
        focus: "渐进放松",
        durationMinutes: 15,
      },
      {
        day: 2,
        title: "月光花园",
        theme:
          "在月光洒落的花园中漫步，空气中弥漫着薰衣草和夜来香，每一步都更深地沉入宁静",
        focus: "视觉意象",
        durationMinutes: 15,
      },
      {
        day: 3,
        title: "星河沉降",
        theme:
          "想象自己漂浮在温暖的星河中，意识随着缓慢的呼吸一点一点沉入深蓝色的宇宙",
        focus: "深度放松",
        durationMinutes: 18,
      },
      {
        day: 4,
        title: "数息安眠",
        theme:
          "用古老的数息法配合身体扫描，在有节奏的倒数中让大脑的杂音逐渐归零",
        focus: "数息入眠",
        durationMinutes: 15,
      },
      {
        day: 5,
        title: "深海摇篮",
        theme:
          "在深海中被温暖的洋流轻轻摇曳，那是母亲子宫般的安全感，让意识彻底交付给黑夜",
        focus: "深度催眠",
        durationMinutes: 20,
      },
    ],
  },
  {
    id: "7day-stress",
    name: "7日减压疗程",
    description: "科学管理压力，重建身心平衡与毛细",
    icon: "💆",
    level: "intermediate",
    color: "amber",
    days: [
      {
        day: 1,
        title: "压力地图",
        theme:
          "用觉知扫描全身，绘制你的压力地图——找到那些紧绷、疼痛、堵塞的区域",
        focus: "觉知定位",
        durationMinutes: 10,
      },
      {
        day: 2,
        title: "呼吸方舟",
        theme: "学习4-7-8呼吸法和箱式呼吸，让呼吸成为随时可用的减压工具",
        focus: "呼吸调节",
        durationMinutes: 12,
      },
      {
        day: 3,
        title: "边界建立",
        theme: "在冥想中建立内心的安全边界，学会对过度的期待和要求温柔地说不",
        focus: "心理边界",
        durationMinutes: 12,
      },
      {
        day: 4,
        title: "情绪炼金",
        theme:
          "将焦虑和压力想象成粗糙的矿石，通过觉知的火焰将其炼化为平静的金属",
        focus: "情绪转化",
        durationMinutes: 15,
      },
      {
        day: 5,
        title: "山岳冥想",
        theme:
          "将自己想象成一座巍峨的大山——风雨雷电在表面来去，而核心始终安稳不动",
        focus: "稳定性训练",
        durationMinutes: 15,
      },
      {
        day: 6,
        title: "慈悲之雨",
        theme:
          "向自己洒下慈悲的雨滴，允许自己不完美，允许自己疲惫，允许自己只是做一个人",
        focus: "自我慈悲",
        durationMinutes: 15,
      },
      {
        day: 7,
        title: "重载平衡",
        theme:
          "整合一周的减压工具，建立日常的5分钟微冥想习惯，让平静成为可持续的生活方式",
        focus: "日常融合",
        durationMinutes: 10,
      },
    ],
  },
  {
    id: "5day-focus",
    name: "5日专注力训练",
    description: "用正念技术提升注意力品质，进入深度心流",
    icon: "🎯",
    level: "advanced",
    color: "violet",
    days: [
      {
        day: 1,
        title: "烛火凝视",
        theme:
          "将注意力集中在一点烛火上，觉察心念的每一次游离，温柔地将其拉回中心",
        focus: "单点集中",
        durationMinutes: 10,
      },
      {
        day: 2,
        title: "声音聚焦",
        theme:
          "在环境中选择一种声音作为锚点，无论多少噪音干扰，都持续追踪那一缕声音",
        focus: "听觉专注",
        durationMinutes: 12,
      },
      {
        day: 3,
        title: "身体微观",
        theme:
          "将注意力细化到一粒尘埃大小，扫描身体最微细的感受——脉搏、温度、气流",
        focus: "微观觉知",
        durationMinutes: 15,
      },
      {
        day: 4,
        title: "开放觉知",
        theme:
          "从单点扩展到全景式的开放觉知，同时感知身体、呼吸、声音、空间的全部",
        focus: "全景注意",
        durationMinutes: 15,
      },
      {
        day: 5,
        title: "心流之门",
        theme: "整合前四天的技术，建立快速进入深度专注状态的个人触发器和仪式感",
        focus: "心流触发",
        durationMinutes: 15,
      },
    ],
  },
];

interface CourseCatalogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDay: (course: MeditationCourse, day: CourseDay) => void;
  completedDays: Record<string, number[]>;
}

export const CourseCatalog: React.FC<CourseCatalogProps> = ({
  isOpen,
  onClose,
  onSelectDay,
  completedDays,
}) => {
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);

  if (!isOpen) return null;

  const levelLabel: Record<string, string> = {
    beginner: "🌱 入门",
    intermediate: "🧘 进阶",
    advanced: "🔮 高级",
  };

  const colorMap: Record<
    string,
    { bg: string; border: string; text: string; accent: string }
  > = {
    emerald: {
      bg: "from-emerald-50 to-teal-50",
      border: "border-emerald-100",
      text: "text-emerald-600",
      accent: "bg-emerald-500",
    },
    indigo: {
      bg: "from-indigo-50 to-violet-50",
      border: "border-indigo-100",
      text: "text-indigo-600",
      accent: "bg-indigo-500",
    },
    amber: {
      bg: "from-amber-50 to-orange-50",
      border: "border-amber-100",
      text: "text-amber-600",
      accent: "bg-amber-500",
    },
    violet: {
      bg: "from-violet-50 to-purple-50",
      border: "border-violet-100",
      text: "text-violet-600",
      accent: "bg-violet-500",
    },
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white/95 backdrop-blur-xl rounded-[2rem] shadow-2xl w-[90vw] max-w-2xl max-h-[85vh] overflow-y-auto p-8 animate-in zoom-in-95 fade-in duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            🎶 冥想课程
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl font-bold"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          {COURSES.map((course) => {
            const colors = colorMap[course.color] || colorMap.indigo;
            const completed = completedDays[course.id] || [];
            const progress = Math.round(
              (completed.length / course.days.length) * 100,
            );
            const isExpanded = expandedCourse === course.id;

            return (
              <div
                key={course.id}
                className={`bg-gradient-to-br ${colors.bg} rounded-2xl border ${colors.border} overflow-hidden transition-all`}
              >
                {/* 课程头 */}
                <button
                  onClick={() =>
                    setExpandedCourse(isExpanded ? null : course.id)
                  }
                  className="w-full p-5 text-left flex items-start gap-4"
                >
                  <span className="text-3xl">{course.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-slate-800">
                        {course.name}
                      </span>
                      <span className="text-[8px] px-1.5 py-0.5 bg-white/60 rounded-full font-bold text-slate-500">
                        {levelLabel[course.level]}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mb-2">
                      {course.description}
                    </p>
                    {/* 进度条 */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-white/60 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${colors.accent} rounded-full transition-all`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-[9px] font-bold text-slate-400">
                        {completed.length}/{course.days.length}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`text-sm transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  >
                    ▼
                  </span>
                </button>

                {/* 展开的天数列表 */}
                {isExpanded && (
                  <div className="px-5 pb-5 space-y-2">
                    {course.days.map((day) => {
                      const isDone = completed.includes(day.day);
                      return (
                        <button
                          key={day.day}
                          onClick={() => onSelectDay(course, day)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                            isDone
                              ? "bg-white/40 border border-white/50"
                              : "bg-white/70 border border-white/80 hover:shadow-sm hover:-translate-y-0.5"
                          }`}
                        >
                          <span
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black ${
                              isDone
                                ? "bg-emerald-100 text-emerald-600"
                                : "bg-slate-100 text-slate-400"
                            }`}
                          >
                            {isDone ? "✓" : day.day}
                          </span>
                          <div className="flex-1 text-left">
                            <div className="text-xs font-bold text-slate-700">
                              Day {day.day} · {day.title}
                            </div>
                            <div className="text-[9px] text-slate-400">
                              {day.focus} · {day.durationMinutes}分钟
                            </div>
                          </div>
                          {!isDone && (
                            <span
                              className={`text-[8px] font-bold ${colors.text} px-2 py-0.5 rounded-full bg-white/80`}
                            >
                              开始
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
