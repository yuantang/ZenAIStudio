/**
 * VibeVoice-Realtime 0.5B WebSocket 客户端
 * 连接本地 VibeVoice 推理服务，实现流式 TTS
 */

import { MeditationScript } from '../types';

const VIBEVOICE_WS_URL = 'ws://localhost:8765';
const SAMPLE_RATE = 24000; // VibeVoice 默认输出采样率

// 可用的 VibeVoice 语音
export const VIBEVOICE_VOICES = [
  { id: 'Carter', name: 'Carter (男声·沉稳)', gender: 'male' },
  { id: 'Nova', name: 'Nova (女声·温暖)', gender: 'female' },
  { id: 'Echo', name: 'Echo (中性·清晰)', gender: 'neutral' },
] as const;

/**
 * 检测 VibeVoice 本地服务是否可用
 */
export async function checkVibeVoiceStatus(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(VIBEVOICE_WS_URL);
      const timer = setTimeout(() => {
        ws.close();
        resolve(false);
      }, 3000);

      ws.onopen = () => {
        clearTimeout(timer);
        ws.close();
        resolve(true);
      };
      ws.onerror = () => {
        clearTimeout(timer);
        resolve(false);
      };
    } catch {
      resolve(false);
    }
  });
}

/**
 * 通过 WebSocket 调用 VibeVoice-Realtime 合成单段语音
 */
async function callVibeVoiceTTS(
  text: string,
  speakerName: string = 'Carter'
): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(VIBEVOICE_WS_URL);
    const audioChunks: Float32Array[] = [];
    let totalSamples = 0;

    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      // 发送 TTS 请求（遵循 VibeVoice-Realtime 协议）
      const request = JSON.stringify({
        text: text,
        speaker: speakerName,
        stream: true,
      });
      ws.send(request);
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        // 接收音频 PCM 数据
        const floatData = new Float32Array(event.data);
        audioChunks.push(floatData);
        totalSamples += floatData.length;
      } else {
        // JSON 控制消息
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'end' || msg.done) {
            ws.close();
          }
        } catch {
          // 忽略非 JSON 消息
        }
      }
    };

    ws.onclose = () => {
      // 拼接所有 chunk
      const merged = new Float32Array(totalSamples);
      let offset = 0;
      for (const chunk of audioChunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      resolve(merged);
    };

    ws.onerror = (err) => {
      reject(new Error(`VibeVoice WebSocket 连接失败: ${err}`));
    };

    // 超时保护
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      if (totalSamples === 0) {
        reject(new Error('VibeVoice TTS 超时（120 秒无响应）'));
      }
    }, 120_000);
  });
}

/**
 * crossfade 拼接多段音频
 */
function crossfadeMerge(chunks: Float32Array[], fadeSamples: number): Float32Array {
  if (chunks.length === 0) return new Float32Array(0);
  if (chunks.length === 1) return chunks[0];

  let totalLen = chunks[0].length;
  for (let i = 1; i < chunks.length; i++) {
    totalLen += chunks[i].length - fadeSamples;
  }
  totalLen = Math.max(totalLen, 0);

  const merged = new Float32Array(totalLen);
  let writePos = 0;

  for (let c = 0; c < chunks.length; c++) {
    const chunk = chunks[c];
    if (c === 0) {
      merged.set(chunk, 0);
      writePos = chunk.length - fadeSamples;
    } else {
      const overlapStart = writePos;
      const actualFade = Math.min(fadeSamples, chunk.length, merged.length - overlapStart);
      for (let i = 0; i < actualFade; i++) {
        const fadeOut = 1 - i / actualFade;
        const fadeIn = i / actualFade;
        merged[overlapStart + i] = merged[overlapStart + i] * fadeOut + chunk[i] * fadeIn;
      }
      const remaining = chunk.length - actualFade;
      if (remaining > 0) {
        merged.set(chunk.subarray(actualFade), overlapStart + actualFade);
      }
      writePos = overlapStart + chunk.length - fadeSamples;
    }
  }
  return merged;
}

/**
 * Float32Array → PCM Int16 Uint8Array（与 Gemini TTS 输出格式对齐）
 */
function float32ToInt16Bytes(float32: Float32Array): Uint8Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return new Uint8Array(int16.buffer);
}

/**
 * 完整冥想语音合成（VibeVoice 版）
 * 接口与 geminiService.synthesizeFullMeditation 对齐
 */
export async function synthesizeWithVibeVoice(
  script: MeditationScript,
  voiceName: string = 'Carter'
): Promise<Uint8Array> {
  console.log(`[VibeVoice TTS] 开始合成，语音: ${voiceName}`);

  const sectionTexts = script.sections.map(s => s.content).filter(t => t.trim());
  
  // VibeVoice-Realtime 0.5B 最长支持 ~10 分钟
  // 按段落逐段合成 + crossfade 拼接
  const audioChunks: Float32Array[] = [];
  
  for (let i = 0; i < sectionTexts.length; i++) {
    const text = sectionTexts[i];
    console.log(`[VibeVoice TTS] 合成段落 ${i + 1}/${sectionTexts.length} (${text.length} 字)`);
    
    const pcmFloat = await callVibeVoiceTTS(text, voiceName);
    audioChunks.push(pcmFloat);
    
    // 段落间无声间隔（按 pauseSeconds 填充静音）
    const pause = script.sections[i]?.pauseSeconds || 0;
    if (pause > 0 && i < sectionTexts.length - 1) {
      const silenceSamples = Math.ceil(SAMPLE_RATE * pause);
      audioChunks.push(new Float32Array(silenceSamples));
    }
  }

  // 50ms crossfade 拼接消除段落接缝
  const fadeSamples = Math.ceil(SAMPLE_RATE * 0.05);
  const merged = crossfadeMerge(audioChunks, fadeSamples);

  console.log(`[VibeVoice TTS] 合成完成，总采样: ${merged.length}，时长: ${(merged.length / SAMPLE_RATE).toFixed(1)}s`);
  
  return float32ToInt16Bytes(merged);
}
