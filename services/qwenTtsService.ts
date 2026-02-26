import { MeditationScript } from '../types';

/**
 * 阿里云百炼 (千问/CosyVoice) TTS 服务单段合成 (基于 WebSocket 双工流式协议)
 * 使用纯净的 PCM 数据流合并，省去 WAV 解码步骤
 */
export const synthesizeQwenVoiceSync = async (
  text: string,
  voiceId: string,
  apiKey: string
): Promise<ArrayBuffer> => {
  if (!apiKey) {
    throw new Error('未配置阿里云 DashScope API Key (VITE_DASHSCOPE_API_KEY)');
  }

  return new Promise((resolve, reject) => {
    // 强制每次生成新的请求 task_id（使用简单随机 Hex 字符串）
    const taskId = Math.random().toString(16).substring(2) + Math.random().toString(16).substring(2);
    
    // 使用 ws 连接，将 apiKey 放入 Query 请求，规避浏览器直接修改 Header 的同源跨域安全策略限制
    const ws = new WebSocket(`wss://dashscope.aliyuncs.com/api-ws/v1/inference?api_key=${apiKey}`);
    ws.binaryType = 'arraybuffer';
    
    // 累加所有收到的二进制 pcm chunk
    const pcmChunks: Uint8Array[] = [];
    
    ws.onopen = () => {
      // 1. 握手成功后发送推理参数配置
      const runReq = {
        header: {
          action: 'run-task',
          task_id: taskId,
          // duplex 原生双工流式收发
          streaming: 'duplex'
        },
        payload: {
          model: 'cosyvoice-v1', 
          task_group: 'audio',
          task: 'tts',
          function: 'SpeechSynthesizer',
          input: {},
          parameters: {
            voice: voiceId,
            text_type: 'PlainText',
            sample_rate: 24000,
            format: 'pcm',
            // 降低到 0.85 甚至更低，增强冥想时引导声音舒缓、平静的疗愈感
            rate: 0.85
          }
        }
      };
      ws.send(JSON.stringify(runReq));
      
      // 2. 发送实际待合成的文本内容
      const continueReq = {
        header: {
          action: 'continue-task',
          task_id: taskId,
          streaming: 'duplex'
        },
        payload: {
          input: {
            text: text
          }
        }
      };
      ws.send(JSON.stringify(continueReq));

      // 3. 标记输入结束，触发云端合成闭环
      const finishReq = {
        header: {
          action: 'finish-task',
          task_id: taskId,
          streaming: 'duplex'
        },
        payload: {
          input: {}
        }
      };
      ws.send(JSON.stringify(finishReq));
    };

    ws.onmessage = (event) => {
      // 如果接收到的是字符串信号帧
      if (typeof event.data === 'string') {
        const msg = JSON.parse(event.data);
        if (msg.header?.event === 'task-finished') {
          // 合成完成信号，安全断开 ws
          ws.close();
          // 全部收到后合并
          const totalLen = pcmChunks.reduce((sum, c) => sum + c.length, 0);
          const merged = new Uint8Array(totalLen);
          let offset = 0;
          for (const chunk of pcmChunks) {
            merged.set(chunk, offset);
            offset += chunk.length;
          }
          resolve(merged.buffer);
        } else if (msg.header?.event === 'task-failed') {
          ws.close();
          reject(new Error(`阿里云 CosyVoice 失败: ${msg.header.error_message}`));
        }
      } 
      // 否则为极速推流回来的二进制语音片段
      else if (event.data instanceof ArrayBuffer) {
        pcmChunks.push(new Uint8Array(event.data));
      } else if (event.data instanceof Blob) {
        // Blob 降级兼容
        event.data.arrayBuffer().then((ab) => {
          pcmChunks.push(new Uint8Array(ab));
        });
      }
    };

    ws.onerror = (e) => {
      reject(new Error('CosyVoice WebSocket 服务未连接，请重试'));
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
  console.log(`[Qwen TTS] 开始合成，使用 CosyVoice 极品音色: ${voiceName}`);

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
    console.log(`[Qwen TTS] CosyVoice 并发推流中 -> 段落 ${i + 1}/${sectionTexts.length} (${text.length} 字)`);

    // 直接通过 WebSocket 返回 PCM
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

