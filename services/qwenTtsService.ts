import { MeditationScript } from '../types';

const QWEN_TTS_API_URL = 'https://dashscope.aliyuncs.com/api/v1/services/audio/text-to-speech/text-to-speech';

/**
 * 提取 WAV 文件的 PCM Int16 数据
 */
function extractPcmFromWav(wavBuffer: ArrayBuffer): Uint8Array {
  // 阿里云直接返回标准 WAV 或 MP3，这里请求了 format: "wav"
  const view = new DataView(wavBuffer);
  // WAV header 固定 44 字节
  const dataOffset = 44;
  return new Uint8Array(wavBuffer, dataOffset);
}

/**
 * 阿里云百炼 (千问/CosyVoice) TTS 服务单段合成
 */
export const synthesizeQwenVoiceSync = async (
  text: string,
  voiceId: string,
  apiKey: string
): Promise<ArrayBuffer> => {
  if (!apiKey) {
    throw new Error('未配置阿里云 DashScope API Key (VITE_DASHSCOPE_API_KEY)');
  }

  const payload = {
    model: voiceId,
    input: {
      text: text,
    },
    parameters: {
      text_type: "PlainText",
      voice: voiceId,
      format: "wav",
      sample_rate: 24000
    }
  };

  const response = await fetch(QWEN_TTS_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    let errorMsg = response.statusText;
    try {
      const errorJson = await response.json();
      errorMsg = errorJson.message || errorJson.code || errorMsg;
    } catch (e) {
      errorMsg = await response.text();
    }
    throw new Error(`千问 TTS 请求失败 (${response.status}): ${errorMsg}`);
  }

  return await response.arrayBuffer();
};

/**
 * 完整冥想语音合成（阿里云千问版）
 * 接口与 geminiService.synthesizeFullMeditation 对齐
 */
export async function synthesizeWithQwen(
  script: MeditationScript,
  voiceName: string = 'sambert-zhichu-v1'
): Promise<Uint8Array> {
  console.log(`[Qwen TTS] 开始合成，使用千问音色: ${voiceName}`);

  const apiKey = (import.meta as any).env.VITE_DASHSCOPE_API_KEY;
  if (!apiKey) {
    throw new Error('请在项目根目录的 .env.local 中配置 VITE_DASHSCOPE_API_KEY');
  }

  const sectionTexts = script.sections
    .map(s => s.content)
    .filter(t => t.trim());

  const audioChunks: Uint8Array[] = [];
  const SAMPLE_RATE = 24000; // 请求的采样率
  const BYTES_PER_SAMPLE = 2; // Int16

  for (let i = 0; i < sectionTexts.length; i++) {
    const text = sectionTexts[i];
    console.log(`[Qwen TTS] 合成段落 ${i + 1}/${sectionTexts.length} (${text.length} 字)`);

    const wavData = await synthesizeQwenVoiceSync(text, voiceName, apiKey);
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

  console.log(`[Qwen TTS] 合成完成，总字节: ${merged.length}，时长: ${(merged.length / BYTES_PER_SAMPLE / SAMPLE_RATE).toFixed(1)}s`);

  return merged;
}
