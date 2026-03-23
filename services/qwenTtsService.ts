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
// 事件流: session.update → input_text_buffer.append// ─── Qwen3-Instruct Realtime 连续上下文长会话合成 ──────────────────────
// ─── Qwen3-Instruct Realtime 连续上下文长会话合成 ──────────────────────
export const synthesizeQwen3RealtimeContinuous = async (
  sections: { text: string; pause: number }[],
  voiceId: string,
  apiKey: string,
  model: string = 'qwen3-tts-instruct-flash-realtime'
): Promise<Uint8Array> => {
  return new Promise((resolve, reject) => {
    // 通过 Vite 代理转发 WebSocket，代理自动注入 Authorization 鉴权头
    // 关键：model 必须作为查询参数传递给 DashScope，否则服务端会拒绝连接
    const isSecure = window.location.protocol === 'https:';
    const proxyUrl = `${isSecure ? 'wss:' : 'ws:'}//${window.location.host}/ws/dashscope?model=${model}`;
    
    console.log(`[Qwen3 Realtime] 通过代理建立连接: ${proxyUrl}`);
    const ws = new WebSocket(proxyUrl);
    ws.binaryType = 'arraybuffer';
    
    const audioChunks: Uint8Array[] = [];
    let eventId = 0;

    const sendEvent = (event: any) => {
      event.event_id = `evt_${++eventId}_${Date.now()}`;
      ws.send(JSON.stringify(event));
    };

    ws.onopen = () => {
      console.log('[Qwen3 Realtime] 物理连接已开启，正在初始化 session...');
      // 官方文档建议在 session.update 中明确指定 model
      sendEvent({
        type: 'session.update',
        session: {
          model: model, // 在此处声明模型，而非 URL
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
      
      // 等待 session 配置生效后，一次性发送全部文本文本缓冲
      setTimeout(() => {
        // 利用换行和省略号暗示段落间的长停顿，让 Instruct 模型理解上下文
        const fullText = sections.map(s => s.text).join('\n\n……\n\n');
        
        console.log(`[Qwen3 Realtime] 推送全脚本流，总长度: ${fullText.length} 字符`);
        
        // 建议单次发送文本不要过长，我们保守按 500 字一截发送 append，虽然底层是 server_commit 会自动拼接合并
        for (let i = 0; i < fullText.length; i += 500) {
          sendEvent({
            type: 'input_text_buffer.append',
            text: fullText.slice(i, i + 500)
          });
        }
        
        // 所有文本发送完毕，标记会话结束。
        // 服务器内部将完成缓冲中剩余的识别及合成，最终返回 session.finished
        sendEvent({ type: 'session.finish' });
      }, 50);
    };

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        const msg = JSON.parse(event.data);
        const eventType = msg.type;

        if (eventType === 'error') {
          console.error('[Qwen3 Realtime] 服务端返回致命错误:', msg.error);
          ws.close();
          reject(new Error(`Qwen3-TTS 错误: ${JSON.stringify(msg.error)}`));
          return;
        }

        if (eventType === 'response.audio.delta') {
          const b64 = msg.delta || '';
          if (b64) {
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            audioChunks.push(bytes);
          }
        } 
        else if (eventType === 'response.done') {
          // 当前单句合成完毕，但由于我们已发送 session.finish，耐心等待最终事件即可
          // 不再基于 done 做段落映射，避免越界异常
        } 
        else if (eventType === 'session.finished') {
          console.log('[Qwen3 Realtime] session.finished，所有长流音频接收完毕');
          ws.close();
          
          const totalLen = audioChunks.reduce((s, c) => s + c.length, 0);
          if (totalLen === 0) {
            reject(new Error('Qwen3-TTS 返回了空音频，可能受到了内容拦截或并发超限'));
            return;
          }
          const merged = new Uint8Array(totalLen);
          let off = 0;
          for (const c of audioChunks) { merged.set(c, off); off += c.length; }
          resolve(merged);
        }
      }
    };

    ws.onerror = (e) => {
      console.error('[Qwen3 Realtime] WebSocket 物理连接错误:', e);
      reject(new Error('Qwen3-TTS Realtime WebSocket 连接断开或失败'));
    };

    ws.onclose = (e) => {
      console.log(`[Qwen3 Realtime] 连接退出: code=${e.code}`);
    };
  });
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

  // 优先从 localStorage 读取用户配置，其次退回默认环境变量
  const apiKey = localStorage.getItem('zenai_dashscope_api_key') || (import.meta as any).env.VITE_DASHSCOPE_API_KEY;
  if (!apiKey) {
    throw new Error('未检测到 DashScope API Key，请点击右上角设置图标进行配置。');
  }

  // 构建待合成的长队列
  const sections = script.sections
    .map(s => ({ text: s.content.trim(), pause: s.pauseSeconds || 0 }))
    .filter(s => s.text.length > 0);

  if (targetModel.includes('qwen3-tts') || targetModel.includes('qwen-tts')) {
    // 【全新重构】Qwen3-Instruct 使用单个长会话进行连贯合成，保障所有段落语调和大小的一致性！
    console.log(`[TTS Router] → 进入长上下文串行会话合成 (Qwen3 Realtime)`);
    return await synthesizeQwen3RealtimeContinuous(sections, voiceName, apiKey, targetModel);
  } else {
    // CosyVoice 为 HTTP 接口依然使用原本的循环合并模式
    console.log(`[TTS Router] → 使用标准分段合成 (CosyVoice HTTP)`);
    
    const audioChunks: Uint8Array[] = [];
    const SAMPLE_RATE = 24000;
    const BYTES_PER_SAMPLE = 2;
    
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      console.log(`[CosyVoice] 推流中 -> 段落 ${i + 1}/${sections.length} (${section.text.length} 字)`);
      
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
