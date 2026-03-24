import { MeditationScript } from '../types';
import { QWEN_VOICES } from '../constants';

/**
 * 阿里云百炼 TTS 服务
 * 
 * CosyVoice 系列 → 使用旧式 inference 协议 (run-task / continue-task / finish-task)
 * Qwen3-TTS 系列 → 使用新版 Realtime 协议 (session.update / input_text_buffer.append / session.finish)
 * 
 * 参考文档: https://help.aliyun.com/zh/model-studio/qwen-tts-realtime
 */

// ─── CosyVoice 旧协议 ──────────────────────────────────────────────
const synthesizeCosyVoice = async (
  text: string,
  voiceId: string,
  apiKey: string,
  model: string = 'cosyvoice-v1'
): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const taskId = Math.random().toString(16).substring(2) + Math.random().toString(16).substring(2);
    const ws = new WebSocket(`wss://dashscope.aliyuncs.com/api-ws/v1/inference?api_key=${apiKey}`);
    ws.binaryType = 'arraybuffer';
    const pcmChunks: Uint8Array[] = [];

    ws.onopen = () => {
      ws.send(JSON.stringify({
        header: { action: 'run-task', task_id: taskId, streaming: 'duplex' },
        payload: {
          model,
          task_group: 'audio', task: 'tts', function: 'SpeechSynthesizer',
          input: {},
          parameters: { voice: voiceId, text_type: 'PlainText', sample_rate: 24000, format: 'pcm' }
        }
      }));
      ws.send(JSON.stringify({
        header: { action: 'continue-task', task_id: taskId, streaming: 'duplex' },
        payload: { input: { text } }
      }));
      ws.send(JSON.stringify({
        header: { action: 'finish-task', task_id: taskId, streaming: 'duplex' },
        payload: { input: {} }
      }));
    };

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        const msg = JSON.parse(event.data);
        if (msg.header?.event === 'task-finished') {
          ws.close();
          const totalLen = pcmChunks.reduce((s, c) => s + c.length, 0);
          const merged = new Uint8Array(totalLen);
          let off = 0;
          for (const c of pcmChunks) { merged.set(c, off); off += c.length; }
          resolve(merged.buffer);
        } else if (msg.header?.event === 'task-failed') {
          ws.close();
          reject(new Error(`CosyVoice 失败: ${msg.header.error_message}`));
        }
      } else if (event.data instanceof ArrayBuffer) {
        pcmChunks.push(new Uint8Array(event.data));
      } else if (event.data instanceof Blob) {
        event.data.arrayBuffer().then(ab => pcmChunks.push(new Uint8Array(ab)));
      }
    };

    ws.onerror = () => reject(new Error('CosyVoice WebSocket 连接失败'));
  });
};

// ─── 新增：文本硬分片辅助函数（防止单次请求文本过长导致 DashScope 超时） ─────
const splitTextByPunctuation = (text: string, maxLength: number = 300): string[] => {
  if (text.length <= maxLength) return [text];
  const chunks: string[] = [];
  let currentChunk = '';
  // 按常见的中文标点和换行符切分
  const sentences = text.split(/([。！？\n])/);
  for (let i = 0; i < sentences.length; i++) {
    const part = sentences[i];
    if (!part) continue;
    // 如果单个 part 本身就超过 maxLength（比如超长无标点内容），强制切断（极端情况保留原样）
    if (currentChunk.length + part.length > maxLength) {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = '';
      }
      if (part.length > maxLength) {
        // 连一个段落本身就超长，暂且强行放进去（或者你可再严格按照定长切片）
        chunks.push(part);
      } else {
        currentChunk = part;
      }
    } else {
      currentChunk += part;
    }
  }
  if (currentChunk) chunks.push(currentChunk);
  return chunks.filter(c => c.trim().length > 0);
};

// ─── Qwen3-TTS 生产环境 Serverless 中转（分段并发版） ──────────────────────────
const synthesizeQwen3ViaApi = async (
  sections: { text: string; pause: number }[],
  voiceId: string,
  apiKey: string,
  model: string
): Promise<Uint8Array> => {
  const SAMPLE_RATE = 24000;
  const BYTES_PER_SAMPLE = 2;
  
  console.log(`[Qwen3 API] 开始分段并行合成，总段数: ${sections.length}`);
  
  // 原子的单次网络请求（文本长度 <= 300）
  const fetchSingleChunk = async (text: string, chunkId: string) => {
    const response = await fetch('/api/tts-realtime', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice: voiceId,
        model,
        apiKey,
        instructions: model.includes('instruct')
          ? '语速稍慢且节奏平稳，音调柔和自然，语气温暖亲切如好友倾诉，吐字清晰舒展，整体风格宁静治愈，保持前后语调高度一致。'
          : undefined,
      }),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(`切片 ${chunkId} 合成失败: ${errBody.error || response.statusText}`);
    }

    const result = await response.json();
    if (!result.success || !result.audio) {
      throw new Error(`切片 ${chunkId} 返回格式异常`);
    }

    const binary = atob(result.audio);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  };

  // 支持内部子分片的段落级合成器
  const fetchSegment = async (fullText: string, index: number) => {
    const subChunks = splitTextByPunctuation(fullText, 300);
    console.log(`[Qwen3 API] 请求段落 ${index + 1}/${sections.length} (${fullText.length} 字) -> 拆分为 ${subChunks.length} 个子请求...`);
    
    const chunkBytesList: Uint8Array[] = [];
    for (let i = 0; i < subChunks.length; i++) {
        const textChunk = subChunks[i];
        // 内部顺序请求以保持上下文平滑度与服务端压力控制
        const bytes = await fetchSingleChunk(textChunk, `${index + 1}-${i + 1}`);
        chunkBytesList.push(bytes);
    }
    
    // 合并这些小段的 PCM
    const totalLen = chunkBytesList.reduce((sum, c) => sum + c.length, 0);
    const merged = new Uint8Array(totalLen);
    let offset = 0;
    for (const c of chunkBytesList) {
        merged.set(c, offset);
        offset += c.length;
    }
    return merged;
  };

  const CONCURRENCY = 2; // API 并发降为 2 规避后端瞬时压力
  const results: Uint8Array[] = new Array(sections.length);
  const queue = sections.map((s, i) => ({ s, i }));
  
  const workers = Array(CONCURRENCY).fill(null).map(async () => {
    while (queue.length > 0) {
      const task = queue.shift();
      if (!task) break;
      results[task.i] = await fetchSegment(task.s.text, task.i);
    }
  });

  await Promise.all(workers);

  const audioChunks: Uint8Array[] = [];
  for (let i = 0; i < sections.length; i++) {
    audioChunks.push(results[i]);
    const pause = sections[i].pause;
    if (pause > 0 && i < sections.length - 1) {
      const silenceBytes = Math.ceil(SAMPLE_RATE * pause) * BYTES_PER_SAMPLE;
      audioChunks.push(new Uint8Array(silenceBytes));
    }
  }

  const totalLen = audioChunks.reduce((sum, c) => sum + c.length, 0);
  const merged = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of audioChunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
};

// ─── Qwen3-TTS 本地开发/直接模式（分段并发 WebSocket 版） ──────────────────────
export const synthesizeQwen3RealtimeContinuous = async (
  sections: { text: string; pause: number }[],
  voiceId: string,
  apiKey: string,
  model: string = 'qwen3-tts-instruct-flash-realtime'
): Promise<Uint8Array> => {
  const SAMPLE_RATE = 24000;
  const BYTES_PER_SAMPLE = 2;
  const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.');

  console.log(`[Qwen3 Realtime] 开始分段并发 WS 合成，总段数: ${sections.length}`);

  // 原子单次 WebSocket 请求
  const fetchSingleChunkWS = async (textChunk: string, chunkId: string): Promise<Uint8Array> => {
    return new Promise((resolve, reject) => {
      let wsUrl: string;
      if (isDev) {
        const isSecure = window.location.protocol === 'https:';
        wsUrl = `${isSecure ? 'wss:' : 'ws:'}//${window.location.host}/ws/dashscope?model=${model}&api_key=${apiKey}`;
      } else {
        wsUrl = `wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=${model}&api_key=${apiKey}`;
      }

      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      const chunks: Uint8Array[] = [];
      let eventId = 0;

      const sendEvent = (event: any) => {
        event.event_id = `evt_${++eventId}_${Date.now()}`;
        ws.send(JSON.stringify(event));
      };

      ws.onopen = () => {
        sendEvent({
          type: 'session.update',
          session: {
            model,
            mode: 'server_commit',
            voice: voiceId,
            language_type: 'Auto',
            response_format: 'pcm',
            sample_rate: 24000,
            speed: 0.85,
            pitch: -0.05,
            ...(model.includes('instruct') ? {
              instructions: '语速稍慢且节奏平稳，音调柔和自然，语气温暖亲切如好友倾诉，吐字清晰舒展，整体风格宁静治愈，保持前后语调高度一致。'
            } : {})
          }
        });

        setTimeout(() => {
          for (let i = 0; i < textChunk.length; i += 500) {
            sendEvent({ type: 'input_text_buffer.append', text: textChunk.slice(i, i + 500) });
          }
          sendEvent({ type: 'session.finish' });
        }, 50);
      };

      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          const msg = JSON.parse(event.data);
          if (msg.type === 'error') {
            ws.close();
            reject(new Error(`切片 ${chunkId} 错误: ${JSON.stringify(msg.error)}`));
          } else if (msg.type === 'response.audio.delta' && msg.delta) {
            const binary = atob(msg.delta);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            chunks.push(bytes);
          } else if (msg.type === 'session.finished') {
            ws.close();
            const totalLen = chunks.reduce((s, c) => s + c.length, 0);
            const merged = new Uint8Array(totalLen);
            let off = 0;
            for (const c of chunks) { merged.set(c, off); off += c.length; }
            resolve(merged);
          }
        }
      };

      ws.onerror = () => reject(new Error(`切片 ${chunkId} WS 连接失败`));
      
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
          reject(new Error(`切片 ${chunkId} 合成超时(45s)`));
        }
      }, 45000);
    });
  };

  // 包装器：支持大于 300 字的文本硬分割后在段落级连续合并，向外仍表现为同一段落
  const fetchSegmentWS = async (fullText: string, index: number): Promise<Uint8Array> => {
    const subChunks = splitTextByPunctuation(fullText, 300);
    console.log(`[Qwen3 Realtime] 请求段落 ${index + 1}/${sections.length} (${fullText.length} 字) -> 拆分为 ${subChunks.length} 个 WS 请求...`);
    
    const chunkBytesList: Uint8Array[] = [];
    for (let i = 0; i < subChunks.length; i++) {
        const textChunk = subChunks[i];
        const bytes = await fetchSingleChunkWS(textChunk, `${index + 1}-${i + 1}`);
        chunkBytesList.push(bytes);
    }
    
    const totalLen = chunkBytesList.reduce((sum, c) => sum + c.length, 0);
    const merged = new Uint8Array(totalLen);
    let offset = 0;
    for (const c of chunkBytesList) {
        merged.set(c, offset);
        offset += c.length;
    }
    return merged;
  };

  const CONCURRENCY = 1; // 免费/标准 API Key 极易在建立 WS 获取鉴权时抛出 429 导致连接失败，本地开发严格降级为串行 1 线程并发
  const results: Uint8Array[] = new Array(sections.length);
  const queue = sections.map((s, i) => ({ s, i }));
  
  const workers = Array(CONCURRENCY).fill(null).map(async () => {
    while (queue.length > 0) {
      const task = queue.shift();
      if (!task) break;
      results[task.i] = await fetchSegmentWS(task.s.text, task.i);
    }
  });

  await Promise.all(workers);

  const audioChunks: Uint8Array[] = [];
  for (let i = 0; i < sections.length; i++) {
    audioChunks.push(results[i]);
    const pause = sections[i].pause;
    if (pause > 0 && i < sections.length - 1) {
      audioChunks.push(new Uint8Array(Math.ceil(SAMPLE_RATE * pause) * BYTES_PER_SAMPLE));
    }
  }

  const totalLen = audioChunks.reduce((sum, c) => sum + c.length, 0);
  const merged = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of audioChunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
};

/**
 * 完整冥想语音合成（阿里云千问版）
 * 接口与 geminiService.synthesizeFullMeditation 对齐
 */
export async function synthesizeWithQwen(
  script: MeditationScript,
  voiceName: string = 'longxiaochun'
): Promise<Uint8Array> {
  const voiceConfig = QWEN_VOICES.find(v => v.id === voiceName);
  const targetModel = voiceConfig?.model || 'cosyvoice-v1';
  console.log(`[Qwen TTS] 开始合成，音色: ${voiceName}，模型: ${targetModel}`);

  const apiKey = localStorage.getItem('zenai_dashscope_api_key') || (import.meta as any).env.VITE_DASHSCOPE_API_KEY;
  if (!apiKey) {
    throw new Error('未检测到 DashScope API Key，请点击右上角设置图标进行配置。');
  }

  const sections = script.sections
    .map(s => ({ text: s.content.trim(), pause: s.pauseSeconds || 0 }))
    .filter(s => s.text.length > 0);

  if (targetModel.includes('qwen3-tts') || targetModel.includes('qwen-tts')) {
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.');
    
    if (isDev) {
      // 本地开发：走 Vite 代理的 WebSocket 直连模式 (现已支持分段并发)
      console.log(`[TTS Router] → 开发环境: WebSocket 代理分段合成 (Qwen3 Realtime)`);
      return await synthesizeQwen3RealtimeContinuous(sections, voiceName, apiKey, targetModel);
    } else {
      // 生产环境：走 Vercel Serverless Function 中转 (分段并发)
      console.log(`[TTS Router] → 生产环境: Serverless 中转分段合成 (Qwen3 via API)`);
      return await synthesizeQwen3ViaApi(sections, voiceName, apiKey, targetModel);
    }
  } else {
    // CosyVoice 依然使用分段合成
    console.log(`[TTS Router] → 使用标准分段合成 (CosyVoice WebSocket)`);
    
    const audioChunks: Uint8Array[] = [];
    const SAMPLE_RATE = 24000;
    const BYTES_PER_SAMPLE = 2;
    
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      console.log(`[CosyVoice] 合成中 -> 段落 ${i + 1}/${sections.length} (${section.text.length} 字)`);
      
      const pcmData = await synthesizeCosyVoice(section.text, voiceName, apiKey, targetModel);
      audioChunks.push(new Uint8Array(pcmData));

      if (section.pause > 0 && i < sections.length - 1) {
        const silenceBytes = Math.ceil(SAMPLE_RATE * section.pause) * BYTES_PER_SAMPLE;
        audioChunks.push(new Uint8Array(silenceBytes));
      }
    }
    
    const totalLen = audioChunks.reduce((sum, c) => sum + c.length, 0);
    const merged = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of audioChunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return merged;
  }
}
