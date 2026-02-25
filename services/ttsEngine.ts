/**
 * TTS 引擎抽象工厂
 * 统一 Gemini 和 VibeVoice 的合成接口
 */

import { MeditationScript, TTSEngine } from '../types';
import { synthesizeFullMeditation } from './geminiService';
import { synthesizeWithVibeVoice } from './vibeVoiceService';

/**
 * 统一 TTS 合成接口
 * 根据选定引擎路由到对应实现
 */
export async function synthesize(
  script: MeditationScript,
  voiceName: string,
  engine: TTSEngine = 'gemini'
): Promise<Uint8Array> {
  switch (engine) {
    case 'vibevoice':
      console.log('[TTS Engine] 使用 VibeVoice-Realtime 本地引擎');
      return synthesizeWithVibeVoice(script, voiceName);
    
    case 'gemini':
    default:
      console.log('[TTS Engine] 使用 Gemini Cloud TTS 引擎');
      return synthesizeFullMeditation(script, voiceName);
  }
}
