import { MeditationScript } from '../types';
import { QWEN_VOICES } from '../constants';

/**
 * 阿里云百炼 TTS 服务
 * 
 * 统一使用标准 Inference 协议 (run-task / continue-task / finish-task)
 * 经验证，该路径在浏览器环境下的 API Key 认证与连接稳定性远超 Realtime 协议。
 */

// ─── 标准任务驱动合成流 (兼容 CosyVoice & Qwen3) ──────────────────────
const synthesizeStandardInference = async (
  text: string,
  voiceId: string,
  apiKey: string,
  model: string
): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const taskId = Math.random().toString(16).substring(2) + Math.random().toString(16).substring(2);
    // 使用已验证最稳健的 /inference 路径，并通过 Query 传递 Key
    const url = `wss://dashscope.aliyuncs.com/api-ws/v1/inference?api_key=${apiKey}`;
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    const pcmChunks: Uint8Array[] = [];

    // 超时保护
    const connectionTimeout = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        ws.close();
        reject(new Error(`[${model}] 连接超时，请检查 API Key 或网络环境`));
      }
    }, 15000);

    ws.onopen = () => {
      clearTimeout(connectionTimeout);
      console.log(`[Qwen Inference] 任务启动: ${model}, 音色: ${voiceId}`);
      
      // 发送 run-task 指令
      ws.send(JSON.stringify({
        header: { action: 'run-task', task_id: taskId, streaming: 'duplex' },
        payload: {
          model,
          task_group: 'audio', task: 'tts', function: 'SpeechSynthesizer',
          input: {},
          parameters: { voice: voiceId, text_type: 'PlainText', sample_rate: 24000, format: 'pcm' }
        }
      }));

      // 发送文本内容
      ws.send(JSON.stringify({
        header: { action: 'continue-task', task_id: taskId, streaming: 'duplex' },
        payload: { input: { text } }
      }));

      // 标记任务结束
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
          reject(new Error(`合成任务失败: ${msg.header.error_message}`));
        }
      } else if (event.data instanceof ArrayBuffer) {
        pcmChunks.push(new Uint8Array(event.data));
      } else if (event.data instanceof Blob) {
        event.data.arrayBuffer().then(ab => pcmChunks.push(new Uint8Array(ab)));
      }
    };

    ws.onerror = (e) => {
      console.error('[Qwen Inference] WebSocket 错误:', e);
      reject(new Error('阿里云 TTS 连接握手失败，请确认 API Key 是否正确（sk-xxxx）'));
    };

    ws.onclose = (e) => {
      if (e.code === 4001) {
        reject(new Error('鉴权未通过 (4001)，请检查 DashScope API Key 是否有效'));
      }
    };
  });
};

/**
 * 完整冥想语音合成（阿里云千问版）
 * 统一使用串行分段合成模式，确保音色一致性与极高的成功率。
 */
export async function synthesizeWithQwen(
  script: MeditationScript,
  voiceName: string = 'longxiaochun'
): Promise<Uint8Array> {
  const voiceConfig = QWEN_VOICES.find(v => v.id === voiceName);
  const targetModel = voiceConfig?.model || 'cosyvoice-v1';
  
  console.log(`[Qwen TTS] 正在使用工作路径: /inference`);
  console.log(`[Qwen TTS] 目标模型: ${targetModel}, 音色: ${voiceName}`);

  // 优先从 localStorage 读取用户配置，其次退回默认环境变量
  const apiKey = localStorage.getItem('zenai_dashscope_api_key') || (import.meta as any).env.VITE_DASHSCOPE_API_KEY;
  if (!apiKey) {
    throw new Error('未检测到 DashScope API Key，请通过设置项进行配置。');
  }

  // 获取处理段落
  const sections = script.sections
    .map(s => ({ text: s.content.trim(), pause: s.pauseSeconds || 0 }))
    .filter(s => s.text.length > 0);

  const audioChunks: Uint8Array[] = [];
  const SAMPLE_RATE = 24000;
  const BYTES_PER_SAMPLE = 2;
  
  // 采用分段并行/串行合成（阿里云任务模式对并发有一定限制，此处使用串行以保证最稳健的体验）
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    console.log(`[TTS Worker] 正在合成第 ${i + 1}/${sections.length} 段...`);
    
    // 调用统一的 Inference 协议
    const pcmData = await synthesizeStandardInference(section.text, voiceName, apiKey, targetModel);
    audioChunks.push(new Uint8Array(pcmData));

    // 插入静音段（如果存在 pauseSeconds）
    if (section.pause > 0 && i < sections.length - 1) {
      const silenceBytes = Math.ceil(SAMPLE_RATE * section.pause) * BYTES_PER_SAMPLE;
      audioChunks.push(new Uint8Array(silenceBytes));
    }
  }
  
  // 合并结果
  const totalLen = audioChunks.reduce((sum, c) => sum + c.length, 0);
  const merged = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of audioChunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  
  console.log(`[Qwen TTS] 合成成功，总数据长度: ${merged.length} 字节`);
  return merged;
}
