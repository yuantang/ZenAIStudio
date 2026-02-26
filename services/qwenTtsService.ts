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

// ─── Qwen3-TTS Realtime 新协议 ─────────────────────────────────────
// 官方文档: https://help.aliyun.com/zh/model-studio/qwen-tts-realtime
// URL: wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=<model_name>
// 鉴权: Authorization: Bearer <api_key> (通过 Sec-WebSocket-Protocol 传递或 query 参数)
// 事件流: session.update → input_text_buffer.append → session.finish
// 音频返回: response.audio.delta (base64 编码的 PCM)
const synthesizeQwen3Realtime = async (
  text: string,
  voiceId: string,
  apiKey: string,
  model: string = 'qwen3-tts-instruct-flash-realtime'
): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    // 浏览器 WebSocket 不能设置自定义 Header，
    // 但 DashScope Realtime 端点同样支持 query 参数鉴权（已验证通过）
    const url = `wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=${model}&api_key=${apiKey}`;
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    const pcmChunks: Uint8Array[] = [];
    let eventId = 0;

    const sendEvent = (event: any) => {
      event.event_id = `evt_${++eventId}_${Date.now()}`;
      ws.send(JSON.stringify(event));
    };

    ws.onopen = () => {
      console.log('[Qwen3 Realtime] 连接已建立，配置会话...');

      // 1. session.update - 配置音色、格式、采样率
      sendEvent({
        type: 'session.update',
        session: {
          mode: 'server_commit',
          voice: voiceId,
          language_type: 'Auto',
          response_format: 'pcm',
          sample_rate: 24000,
          // 语速微调: 0.85
          speed: 0.85,
          // 音调微调: -0.05
          pitch: -0.05,
          // Instruct 模型特有: 用自然语言指令精细控制语音表现力
          ...(model.includes('instruct') ? {
            instructions: '语速稍慢且节奏平稳，音调柔和自然，' +
              '语气温暖亲切如好友倾诉，吐字清晰舒展，' +
              '整体风格宁静治愈，适合冥想引导。',
          } : {})
        }
      });

      // 2. input_text_buffer.append - 发送待合成文本
      sendEvent({
        type: 'input_text_buffer.append',
        text: text
      });

      // 3. 延迟后结束会话，让服务器有时间处理
      setTimeout(() => {
        sendEvent({ type: 'session.finish' });
      }, 200);
    };

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        const msg = JSON.parse(event.data);
        const eventType = msg.type;

        if (eventType === 'error') {
          console.error('[Qwen3 Realtime] 错误:', msg.error);
          ws.close();
          reject(new Error(`Qwen3-TTS 错误: ${JSON.stringify(msg.error)}`));
          return;
        }

        if (eventType === 'response.audio.delta') {
          // 音频数据以 base64 编码返回
          const b64 = msg.delta || '';
          if (b64) {
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            pcmChunks.push(bytes);
          }
        } else if (eventType === 'response.done' || eventType === 'session.finished') {
          console.log(`[Qwen3 Realtime] ${eventType}，合成完成`);
          ws.close();
          const totalLen = pcmChunks.reduce((s, c) => s + c.length, 0);
          if (totalLen === 0) {
            reject(new Error('Qwen3-TTS 返回了空音频，请检查 API Key 权限'));
            return;
          }
          const merged = new Uint8Array(totalLen);
          let off = 0;
          for (const c of pcmChunks) { merged.set(c, off); off += c.length; }
          resolve(merged.buffer);
        } else {
          // 其他事件只做日志
          if (!['response.audio.delta'].includes(eventType)) {
            console.log(`[Qwen3 Realtime] 事件: ${eventType}`);
          }
        }
      }
    };

    ws.onerror = (e) => {
      console.error('[Qwen3 Realtime] WebSocket 错误:', e);
      reject(new Error('Qwen3-TTS Realtime WebSocket 连接失败，请检查网络和 API Key'));
    };

    ws.onclose = (e) => {
      console.log(`[Qwen3 Realtime] 连接关闭: code=${e.code}, reason=${e.reason}`);
    };
  });
};

// ─── 统一的单段合成入口 ─────────────────────────────────────────────
export const synthesizeQwenVoiceSync = async (
  text: string,
  voiceId: string,
  apiKey: string
): Promise<ArrayBuffer> => {
  const voiceConfig = QWEN_VOICES.find(v => v.id === voiceId);
  const targetModel = voiceConfig?.model || 'cosyvoice-v1';

  // 根据模型名称自动选择协议
  if (targetModel.includes('qwen3-tts') || targetModel.includes('qwen-tts')) {
    console.log(`[TTS Router] → Qwen3 Realtime 协议 (模型: ${targetModel}, 音色: ${voiceId})`);
    return synthesizeQwen3Realtime(text, voiceId, apiKey, targetModel);
  } else {
    console.log(`[TTS Router] → CosyVoice 旧协议 (模型: ${targetModel}, 音色: ${voiceId})`);
    return synthesizeCosyVoice(text, voiceId, apiKey, targetModel);
  }
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
  console.log(`[Qwen TTS] 开始合成，音色: ${voiceName}，模型: ${voiceConfig?.model || 'cosyvoice-v1'}`);

  const apiKey = (import.meta as any).env.VITE_DASHSCOPE_API_KEY;
  if (!apiKey) {
    throw new Error('请在项目根目录的 .env.local 中配置 VITE_DASHSCOPE_API_KEY');
  }

  const sectionTexts = script.sections
    .map(s => s.content)
    .filter(t => t.trim());

  const audioChunks: Uint8Array[] = [];
  const SAMPLE_RATE = 24000;
  const BYTES_PER_SAMPLE = 2;

  for (let i = 0; i < sectionTexts.length; i++) {
    const text = sectionTexts[i];
    console.log(`[Qwen TTS] 推流中 -> 段落 ${i + 1}/${sectionTexts.length} (${text.length} 字)`);

    const pcmData = await synthesizeQwenVoiceSync(text, voiceName, apiKey);
    audioChunks.push(new Uint8Array(pcmData));

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

  console.log(`[Qwen TTS] 合成完结! 总字节: ${merged.length}，全长: ${(merged.length / BYTES_PER_SAMPLE / SAMPLE_RATE).toFixed(1)}s`);
  return merged;
}

