/**
 * Coqui TTS HTTP 客户端
 * 连接本地 Coqui TTS Server (XTTS v2)，实现中文语音合成
 */

import { MeditationScript } from '../types';

const COQUI_API_URL = 'http://localhost:5002';

/**
 * 检测 Coqui TTS 本地服务是否可用
 */
export async function checkCoquiTTSStatus(): Promise<boolean> {
  try {
    const resp = await fetch(`${COQUI_API_URL}/`, { signal: AbortSignal.timeout(3000) });
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * 调用 Coqui TTS HTTP API 合成单段语音
 * XTTS v2 支持中文，通过 /api/tts 端点
 */
async function callCoquiTTS(
  text: string,
  language: string = 'zh-cn',
  speakerId: string = ''
): Promise<ArrayBuffer> {
  const params = new URLSearchParams({
    text,
    language_id: language,
  });
  if (speakerId) {
    params.set('speaker_id', speakerId);
  }

  const resp = await fetch(`${COQUI_API_URL}/api/tts?${params.toString()}`, {
    method: 'GET',
    signal: AbortSignal.timeout(120_000),
  });

  if (!resp.ok) {
    throw new Error(`Coqui TTS 请求失败: HTTP ${resp.status}`);
  }

  // Coqui TTS Server 返回的是 WAV 文件
  return resp.arrayBuffer();
}

/**
 * 从 WAV ArrayBuffer 中提取 PCM Int16 数据
 */
function extractPcmFromWav(wavBuffer: ArrayBuffer): Uint8Array {
  const view = new DataView(wavBuffer);
  // WAV header 固定 44 字节
  const dataOffset = 44;
  return new Uint8Array(wavBuffer, dataOffset);
}

/**
 * 完整冥想语音合成（Coqui TTS 版）
 * 接口与 geminiService.synthesizeFullMeditation 对齐
 */
export async function synthesizeWithCoqui(
  script: MeditationScript,
  _voiceName: string = ''
): Promise<Uint8Array> {
  console.log(`[Coqui TTS] 开始合成，使用 XTTS v2 中文模型`);

  const sectionTexts = script.sections
    .map(s => s.content)
    .filter(t => t.trim());

  const audioChunks: Uint8Array[] = [];
  const SAMPLE_RATE = 24000; // XTTS v2 默认采样率
  const BYTES_PER_SAMPLE = 2; // Int16

  for (let i = 0; i < sectionTexts.length; i++) {
    const text = sectionTexts[i];
    console.log(`[Coqui TTS] 合成段落 ${i + 1}/${sectionTexts.length} (${text.length} 字)`);

    const wavData = await callCoquiTTS(text, 'zh-cn');
    const pcm = extractPcmFromWav(wavData);
    audioChunks.push(pcm);

    // 段落间无声间隔
    const pause = script.sections[i]?.pauseSeconds || 0;
    if (pause > 0 && i < sectionTexts.length - 1) {
      const silenceBytes = Math.ceil(SAMPLE_RATE * pause) * BYTES_PER_SAMPLE;
      audioChunks.push(new Uint8Array(silenceBytes));
    }
  }

  // 拼接所有 PCM 数据
  const totalLen = audioChunks.reduce((sum, c) => sum + c.length, 0);
  const merged = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of audioChunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  console.log(`[Coqui TTS] 合成完成，总字节: ${merged.length}，时长: ${(merged.length / BYTES_PER_SAMPLE / SAMPLE_RATE).toFixed(1)}s`);

  return merged;
}
