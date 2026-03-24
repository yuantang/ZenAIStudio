import type { VercelRequest, VercelResponse } from '@vercel/node';
import WebSocket from 'ws';

/**
 * Vercel Serverless Function：Qwen3-TTS Realtime WebSocket 中转代理
 * 
 * 前端通过 POST 请求将文本发给本函数，
 * 本函数在服务端通过 WebSocket（携带 Authorization Header）连接 DashScope，
 * 收集所有音频数据后以 base64 JSON 返回给前端。
 * 
 * 这是解决"浏览器 WebSocket 无法设置 Authorization Header"的唯一生产级方案。
 */

export const config = {
  maxDuration: 60, // Vercel Pro 最长 60s
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 仅允许 POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { text, voice, model, apiKey, instructions } = req.body;

  if (!text || !voice || !apiKey) {
    return res.status(400).json({ error: '缺少必要参数: text, voice, apiKey' });
  }

  const targetModel = model || 'qwen3-tts-instruct-flash-realtime';

  try {
    const audioBuffer = await synthesizeViaWebSocket(text, voice, apiKey, targetModel, instructions);
    
    // 返回 base64 编码的 PCM 音频数据
    const base64Audio = Buffer.from(audioBuffer).toString('base64');
    res.status(200).json({
      success: true,
      audio: base64Audio,
      byteLength: audioBuffer.byteLength,
    });
  } catch (err: any) {
    console.error('[tts-realtime] 合成失败:', err.message);
    res.status(500).json({ error: err.message });
  }
}

function synthesizeViaWebSocket(
  text: string,
  voice: string,
  apiKey: string,
  model: string,
  instructions?: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const url = `wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=${model}`;
    
    // 核心：在服务端可以自由设置 Authorization Header！
    const ws = new WebSocket(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    const audioChunks: Buffer[] = [];
    let eventId = 0;

    const sendEvent = (event: any) => {
      event.event_id = `evt_${++eventId}_${Date.now()}`;
      ws.send(JSON.stringify(event));
    };

    // 超时保护：分段后单段不应超过 45s
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Qwen3-TTS 单段合成超时 (45s)'));
    }, 45000);

    ws.on('open', () => {
      console.log('[tts-realtime] WebSocket 连接已建立');
      sendEvent({
        type: 'session.update',
        session: {
          model,
          mode: 'server_commit',
          voice,
          language_type: 'Auto',
          response_format: 'pcm',
          sample_rate: 24000,
          speed: 0.85,
          pitch: -0.05,
          ...(instructions ? { instructions } : {}),
        },
      });
    });

    ws.on('message', (data: WebSocket.Data) => {
      const msgStr = data.toString();
      const msg = JSON.parse(msgStr);
      const eventType = msg.type;

      if (eventType === 'session.created' || eventType === 'session.updated') {
        console.log(`[tts-realtime] ← ${eventType}，推送文本...`);
        // 分段推送
        for (let i = 0; i < text.length; i += 500) {
          sendEvent({
            type: 'input_text_buffer.append',
            text: text.slice(i, i + 500),
          });
        }
        sendEvent({ type: 'session.finish' });
      }

      if (eventType === 'error') {
        clearTimeout(timeout);
        ws.close();
        reject(new Error(`DashScope 错误: ${msg.error?.message || JSON.stringify(msg.error)}`));
      }

      if (eventType === 'response.audio.delta') {
        const b64 = msg.delta || '';
        if (b64) {
          audioChunks.push(Buffer.from(b64, 'base64'));
        }
      }

      if (eventType === 'session.finished') {
        clearTimeout(timeout);
        ws.close();
        const totalLen = audioChunks.reduce((s, c) => s + c.length, 0);
        if (totalLen === 0) {
          reject(new Error('Qwen3-TTS 返回空音频，可能触发了内容安全过滤'));
          return;
        }
        const merged = Buffer.concat(audioChunks);
        console.log(`[tts-realtime] 合成完成: ${merged.length} 字节`);
        resolve(merged);
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`WebSocket 连接错误: ${err.message}`));
    });

    ws.on('close', (code) => {
      console.log(`[tts-realtime] 退出: code=${code}`);
    });
  });
}
