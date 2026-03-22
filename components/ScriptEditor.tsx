import React from "react";
import { 
  X, 
  Plus, 
  Trash2, 
  Play, 
  MessageSquare, 
  Clock, 
  Sparkles,
  Info,
  RefreshCw
} from "lucide-react";
import { MeditationScript, AmbientHint } from "../types";

interface ScriptEditorProps {
  script: MeditationScript;
  onSave: (updatedScript: MeditationScript) => void;
  onCancel: () => void;
  isProcessing: boolean;
}

const SECTION_TYPES = [
  { id: 'intro', label: '开场引言' },
  { id: 'breathing', label: '呼吸引导' },
  { id: 'body-scan', label: '身体扫描' },
  { id: 'visualization', label: '冥想可视化' },
  { id: 'silence', label: '留白静心' },
  { id: 'outro', label: '结束语' },
];

const AMBIENT_HINTS: { id: AmbientHint; label: string }[] = [
  { id: 'forest', label: '森林' },
  { id: 'rain', label: '细雨' },
  { id: 'ocean', label: '海浪' },
  { id: 'fire', label: '营火' },
  { id: 'space', label: '星空' },
  { id: 'silence', label: '纯净' },
];

export const ScriptEditor: React.FC<ScriptEditorProps> = ({
  script,
  onSave,
  onCancel,
  isProcessing
}) => {
  const [localScript, setLocalScript] = React.useState<MeditationScript>({...script});

  const handleUpdateSection = (index: number, updates: Partial<MeditationScript['sections'][0]>) => {
    const nextSections = [...localScript.sections];
    nextSections[index] = { ...nextSections[index], ...updates };
    setLocalScript({ ...localScript, sections: nextSections });
  };

  const handleAddSection = () => {
    setLocalScript({
      ...localScript,
      sections: [
        ...localScript.sections,
        { type: 'visualization', content: '', pauseSeconds: 3 }
      ]
    });
  };

  const handleDeleteSection = (index: number) => {
    const nextSections = localScript.sections.filter((_, i) => i !== index);
    setLocalScript({ ...localScript, sections: nextSections });
  };

  const totalChars = localScript.sections.reduce((sum, s) => sum + s.content.length, 0);
  const estDuration = localScript.sections.reduce((sum, s) => sum + (s.content.length * 0.4) + s.pauseSeconds, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onCancel}></div>
      
      <div className="relative w-full max-w-5xl max-h-[90vh] glass bg-white/90 dark:bg-slate-900/90 rounded-[3rem] shadow-2xl flex flex-col overflow-hidden border border-white/50">
        {/* Header */}
        <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center">
              <Sparkles className="w-6 h-6 mr-3 text-indigo-500" />
              文稿审阅与编辑
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              您可以在此处调整生成的文稿，调整停顿时间或添加特定的声境线索。
            </p>
          </div>
          <button 
            onClick={onCancel}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
          {localScript.sections.map((section, idx) => (
            <div 
              key={idx} 
              className="group relative bg-white/50 dark:bg-slate-800/40 rounded-2xl p-6 border border-slate-100 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-900 transition-all hover:shadow-md"
            >
              <div className="flex flex-wrap items-center gap-4 mb-4">
                <span className="w-8 h-8 flex items-center justify-center rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-bold">
                  {idx + 1}
                </span>
                
                <select 
                  value={section.type}
                  onChange={(e) => handleUpdateSection(idx, { type: e.target.value as any })}
                  className="bg-transparent text-sm font-bold text-slate-700 dark:text-slate-300 outline-none border-b border-transparent hover:border-slate-200 focus:border-indigo-500 transition-all cursor-pointer"
                >
                  {SECTION_TYPES.map(t => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>

                <div className="flex items-center gap-2 ml-auto text-slate-400">
                  <Clock className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase tracking-wider">段后停顿</span>
                  <input 
                    type="number"
                    value={section.pauseSeconds}
                    onChange={(e) => handleUpdateSection(idx, { pauseSeconds: Number(e.target.value) })}
                    className="w-12 bg-slate-100 dark:bg-slate-800 rounded px-2 py-1 text-xs font-bold text-indigo-600 outline-none"
                  />
                  <span className="text-xs">秒</span>
                </div>
              </div>

              <textarea 
                value={section.content}
                onChange={(e) => handleUpdateSection(idx, { content: e.target.value })}
                placeholder="在此输入或编辑这一段落的冥想词..."
                className="w-full bg-transparent text-slate-600 dark:text-slate-400 text-sm leading-relaxed outline-none min-h-[100px] resize-none"
              />

              <div className="mt-4 pt-4 border-t border-slate-50 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Info className="w-3.5 h-3.5 text-slate-300" />
                    <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">环境暗示</span>
                    <select
                      value={section.ambientHint || ''}
                      onChange={(e) => handleUpdateSection(idx, { ambientHint: e.target.value as any })}
                      className="bg-transparent text-[10px] font-bold text-slate-500 outline-none cursor-pointer hover:text-indigo-500 transition-colors"
                    >
                      <option value="">跟随全局设置</option>
                      {AMBIENT_HINTS.map(h => (
                        <option key={h.id} value={h.id}>{h.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <button 
                  onClick={() => handleDeleteSection(idx)}
                  className="p-2 text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                  title="删除该段"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}

          <button 
            onClick={handleAddSection}
            className="w-full py-4 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl text-slate-400 hover:text-indigo-500 hover:border-indigo-200 dark:hover:border-indigo-900 transition-all flex items-center justify-center gap-2 text-sm font-bold"
          >
            <Plus className="w-5 h-5" />
            添加新段落
          </button>
        </div>

        {/* Footer */}
        <div className="px-8 py-6 bg-slate-50/50 dark:bg-slate-800/20 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-8 text-slate-400">
            <div className="flex flex-col">
              <span className="text-[9px] font-black uppercase tracking-widest">总计字数</span>
              <span className="text-sm font-bold text-slate-600 dark:text-slate-300">{totalChars} 字</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] font-black uppercase tracking-widest">预估全长</span>
              <span className="text-sm font-bold text-slate-600 dark:text-slate-300">
                {Math.floor(estDuration / 60)} 分 {(estDuration % 60).toFixed(0)} 秒
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={onCancel}
              className="px-6 py-3 rounded-full text-sm font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            >
              放弃修改
            </button>
            <button 
              onClick={() => onSave(localScript)}
              disabled={isProcessing || localScript.sections.length === 0}
              className="px-8 py-3 rounded-full bg-indigo-600 text-white text-sm font-bold shadow-lg shadow-indigo-200/50 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center"
            >
              {isProcessing ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-2 fill-current" />
              )}
              确认并开始一站式合成音频
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
