import { GoogleGenAI, Type, Modality, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { SYSTEM_PROMPT, TTS_SYSTEM_INSTRUCTION } from "../constants";
import { MeditationScript, MeditationPersonalization } from "../types";

export const getApiKey = (): string | null => {
  const cachedKey = localStorage.getItem('ZENAI_API_KEY');
  if (cachedKey) return cachedKey;
  const envKey = process.env.API_KEY;
  if (envKey && envKey !== 'YOUR_API_KEY') return envKey;
  return null;
};

function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** 个性化 prompt 片段生成 */
const buildPersonalizationContext = (p?: MeditationPersonalization): string => {
  if (!p) return '';
  const expMap = {
    beginner: '初学者（请使用简单直白的语言，多给引导提示，避免抽象概念）',
    intermediate: '有经验（可以使用适度深入的意象，引入觉察和身体感知）',
    advanced: '深度修行者（可以使用深层意象、无我观照和高级觉知引导）',
  };
  const moodMap = {
    anxious: '焦虑不安（重点引导呼吸放松和安全感建立，多用"你是安全的"类语句）',
    sad: '低落消沉（语调温柔慈悲，重点引导自我接纳和情感释放）',
    restless: '烦躁浮动（先通过身体感知锚定当下，再引导能量下沉）',
    tired: '疲惫乏力（侧重深度放松和能量恢复，节奏更缓慢）',
    neutral: '平静日常（标准冥想引导）',
  };
  const styleMap = {
    mindfulness: '正念觉察（强调当下觉知、不评判的观察、回到呼吸）',
    zen: '东方禅修（融入禅宗美学，空、寂、无的意境，山水意象）',
    'yoga-nidra': '瑜伽尼德拉（渐进式身体旋转、意识在身体各部位流转、深度放松）',
    compassion: '慈悲疗愈（慈心冥想，向自己和他人发送爱与善意）',
  };
  return `\n\n【用户个性化上下文】\n- 冥想经验：${expMap[p.experience]}\n- 当前情绪：${moodMap[p.mood]}\n- 偏好风格：${styleMap[p.style]}\n请根据以上用户状态，调整脚本的深度、语言风格和重点关注方向。`;
};

/**
 * 核心脚本生成器 - 优化稳定性
 */
export const generateMeditationScript = async (
  theme: string,
  durationMinutes: number = 10,
  personalization?: MeditationPersonalization,
  retries = 3
): Promise<MeditationScript> => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key 未配置");

  const ai = new GoogleGenAI({ apiKey });
  const personCtx = buildPersonalizationContext(personalization);
  
  // 500 错误多发于 Pro 模型，重试时回退到 Flash
  const modelName = retries < 2 ? 'gemini-1.5-pro-latest' : 'gemini-1.5-flash-latest';
  
  try {
    const response = await ai.models.generateContent({
      model: modelName, 
      contents: `请根据以下主题生成一份顶级的冥想引导脚本，确保其具备深度的疗愈价值和科学的放松节奏。

【目标时长】：${durationMinutes} 分钟（请根据时长严格控制内容篇幅和段落数量，语音朗读总时长加上停顿时间应尽可能接近 ${durationMinutes} 分钟）
${personCtx}
主题：${theme}`,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            sections: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING },
                  content: { type: Type.STRING },
                  pauseSeconds: { type: Type.NUMBER },
                  ambientHint: { type: Type.STRING }
                },
                required: ["type", "content", "pauseSeconds", "ambientHint"]
              }
            }
          },
          required: ["title", "sections"]
        },
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
        ]
      }
    });

    const text = response.text;
    if (!text) throw new Error("Empty response");
    return JSON.parse(text.trim());
  } catch (error: any) {
    if (retries > 0) {
      const delay = (4 - retries) * 2000;
      await wait(delay);
      return generateMeditationScript(theme, durationMinutes, personalization, retries - 1);
    }
    throw error;
  }
};

/**
 * TTS 合成
 */
export const synthesizeSpeech = async (text: string, voiceName: string, retries = 2): Promise<Uint8Array> => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key 未配置");
  const ai = new GoogleGenAI({ apiKey });
  return callTTS(ai, text, voiceName || 'Zephyr', retries);
};

/**
 * 为段落添加上下文感知的过渡标记文本
 */
const addTransitionMarker = (text: string, pauseSeconds: number, sectionType?: string): string => {
  if (sectionType === 'intro') {
    return text + '\n\n……让我们先从呼吸开始，轻轻地，缓缓地……\n\n';
  }
  if (sectionType === 'breathing') {
    return text + '\n\n……保持这份觉知……带着它，让我们继续向内探索……\n\n';
  }
  if (sectionType === 'body-scan') {
    return text + '\n\n……感受全身的柔软与轻盈……现在，让意识自由地流动……\n\n';
  }
  if (sectionType === 'visualization') {
    if (pauseSeconds >= 15) {
      return text + '\n\n……在这份深邃的宁静中……安住在此……\n\n';
    }
    return text + '\n\n……让这份美好的意象继续在内心流淌……\n\n';
  }
  if (sectionType === 'silence') {
    return text + '\n\n……\n\n';
  }
  if (pauseSeconds >= 15) {
    return text + '\n\n……现在，请在这片宁静中，安静地与自己相处……\n\n';
  } else if (pauseSeconds >= 8) {
    return text + '\n\n……深深地吸气……缓缓地呼出……\n\n';
  } else {
    return text + '\n\n……\n\n';
  }
};

/**
 * TTS 韵律标点注入 — 通过中文标点控制 Gemini TTS 的语速和停顿
 * Gemini TTS 不支持 SSML，但对标点符号非常敏感：
 *   - 省略号「……」→ 0.3-0.5s 停顿
 *   - 逗号「，」→ 0.2s 微停顿
 *   - 破折号「——」→ 0.4s 情感停顿 + 轻微音调变化
 *   - 句号「。」→ 0.3s 正常停顿
 */
const injectProsodyMarkers = (text: string, sectionType?: string): string => {
  let processed = text;
  
  // (1) 所有段落通用：在长句中每 25-40 字插入一个微停顿逗号（仅在无标点时）
  // 查找连续 30 字以上没有标点的段落，在中间自然位置插入逗号
  processed = processed.replace(/([^，。！？；：、\n]{25,40})/g, (match) => {
    // 在中间偏后位置找一个合适的插入点（避免拆词）
    const mid = Math.floor(match.length * 0.6);
    const insertPos = match.indexOf('的', mid) !== -1 ? match.indexOf('的', mid) + 1
      : match.indexOf('了', mid) !== -1 ? match.indexOf('了', mid) + 1
      : match.indexOf('在', mid) !== -1 ? match.indexOf('在', mid) + 1
      : -1;
    if (insertPos > 0 && insertPos < match.length - 3) {
      return match.slice(0, insertPos) + '，' + match.slice(insertPos);
    }
    return match;
  });

  // (2) 段落类型特定的韵律注入
  switch (sectionType) {
    case 'intro':
      // 开场：段首添加缓慢进入的省略号
      processed = '……' + processed;
      break;
      
    case 'breathing':
      // 呼吸段落：在数字/动作词前加停顿，语速极慢
      processed = processed
        .replace(/吸/g, '……吸')
        .replace(/呼/g, '……呼')
        .replace(/屏/g, '……屏')
        .replace(/保持/g, '……保持');
      break;
      
    case 'body-scan':
      // 身体扫描：在身体部位词前加微停顿
      processed = processed
        .replace(/(头顶|额头|眉心|眼睛|脸颊|下巴|脖颈|肩膀|双臂|双手|胸腔|腹部|腰部|臀部|双腿|膝盖|小腿|双脚|脚底)/g, '，$1');
      break;
      
    case 'visualization':
      // 意象段落：在感官动词前加破折号
      processed = processed
        .replace(/(感受|想象|看到|听到|触碰|感知|注意到)/g, '——$1');
      break;
      
    case 'closing':
      // 结束段落：逐渐放慢，多加省略号
      processed = processed
        .replace(/。/g, '……。')
        .replace(/感谢/g, '……感谢');
      break;
  }

  return processed;
};

/**
 * 内部工具：单次 TTS 调用
 */
const callTTS = async (
  ai: GoogleGenAI,
  text: string,
  voiceName: string,
  retries = 2
): Promise<Uint8Array> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName }
          }
        }
      }
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("TTS 引擎未能返回音频数据。");
    return decodeBase64(base64Audio);
  } catch (error: any) {
    if (retries > 0) {
      await wait(2000);
      return callTTS(ai, text, voiceName, retries - 1);
    }
    throw error;
  }
};

const BATCH_CHAR_THRESHOLD = 1500;
const BATCH_TARGET_SIZE = 1200;
// crossfade 时长（采样点数），24kHz 下 50ms = 1200 点
const CROSSFADE_SAMPLES = 1200;

/**
 * 将 Int16LE PCM 字节流解码为 Float32 样本数组
 */
function pcmToFloat32(pcm: Uint8Array): Float32Array {
  const byteLen = pcm.byteLength;
  let alignedBuf = pcm.buffer;
  let byteOff = pcm.byteOffset;
  if (byteOff % 2 !== 0) {
    const copy = new ArrayBuffer(byteLen);
    new Uint8Array(copy).set(pcm);
    alignedBuf = copy;
    byteOff = 0;
  }
  const samplesCount = Math.floor(byteLen / 2);
  const int16 = new Int16Array(alignedBuf, byteOff, samplesCount);
  const float32 = new Float32Array(samplesCount);
  for (let i = 0; i < samplesCount; i++) {
    float32[i] = int16[i] / 32768.0;
  }
  return float32;
}

/**
 * 将 Float32 样本数组编码回 Int16LE PCM 字节流
 */
function float32ToPcm(samples: Float32Array): Uint8Array {
  const pcm = new Uint8Array(samples.length * 2);
  const view = new DataView(pcm.buffer);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, (s < 0 ? s * 0x8000 : s * 0x7FFF) | 0, true);
  }
  return pcm;
}

/**
 * 将多段 Float32 音频样本通过 crossfade 无缝拼接
 * 消除批次接缝处的 click/pop 噪声和音色跳变
 */
function crossfadeMerge(chunks: Float32Array[], fadeSamples: number): Float32Array {
  if (chunks.length === 0) return new Float32Array(0);
  if (chunks.length === 1) return chunks[0];

  // 计算合并后总长度（每个接缝重叠 fadeSamples 个采样点）
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
      // 第一段：直接写入
      merged.set(chunk, 0);
      writePos = chunk.length - fadeSamples;
    } else {
      // 后续段：在重叠区做 crossfade
      const overlapStart = writePos;
      const actualFade = Math.min(fadeSamples, chunk.length, merged.length - overlapStart);
      
      for (let i = 0; i < actualFade; i++) {
        const fadeOut = 1 - (i / actualFade); // 前一段淡出
        const fadeIn = i / actualFade;         // 当前段淡入
        merged[overlapStart + i] = merged[overlapStart + i] * fadeOut + chunk[i] * fadeIn;
      }
      // 重叠区之后的部分直接写入
      const remaining = chunk.length - actualFade;
      if (remaining > 0) {
        merged.set(chunk.subarray(actualFade), overlapStart + actualFade);
      }
      writePos = overlapStart + chunk.length - fadeSamples;
    }
  }

  return merged;
}

export const synthesizeFullMeditation = async (
  script: MeditationScript, 
  voiceName: string, 
  retries = 2
): Promise<Uint8Array> => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key 未配置");

  const ai = new GoogleGenAI({ apiKey });
  const targetVoice = voiceName || 'Zephyr';

  const sectionTexts = script.sections.map((section, idx) => {
    // 先注入韵律控制标点（控制 TTS 语速/停顿）
    let text = injectProsodyMarkers(section.content, section.type);
    // 再添加段落间过渡标记
    if (idx < script.sections.length - 1) {
      text = addTransitionMarker(text, section.pauseSeconds || 3, section.type);
    }
    return text;
  });

  const fullText = sectionTexts.join('');

  // 短文本：单次合成
  if (fullText.length <= BATCH_CHAR_THRESHOLD) {
    console.log(`[TTS] 单次合成 (${fullText.length} 字)`);
    return callTTS(ai, fullText, targetVoice, retries);
  }

  // 长文本：分批合成 + crossfade 拼接
  console.log(`[TTS] 分批合成 (${fullText.length} 字)`);
  const batches: string[] = [];
  let currentBatch = '';
  for (const sectionText of sectionTexts) {
    if (currentBatch.length + sectionText.length > BATCH_TARGET_SIZE && currentBatch.length > 0) {
      batches.push(currentBatch);
      currentBatch = sectionText;
    } else {
      currentBatch += sectionText;
    }
  }
  if (currentBatch.length > 0) batches.push(currentBatch);
  console.log(`[TTS] ${batches.length} 批: [${batches.map(b => b.length + '字').join(', ')}]`);

  // 顺序合成每批并解码为 Float32
  const floatChunks: Float32Array[] = [];
  for (let i = 0; i < batches.length; i++) {
    console.log(`[TTS] 合成 ${i + 1}/${batches.length}...`);
    const pcm = await callTTS(ai, batches[i], targetVoice, retries);
    floatChunks.push(pcmToFloat32(pcm));
    if (i < batches.length - 1) await wait(500);
  }

  // Crossfade 无缝拼接（消除接缝爆音）
  console.log(`[TTS] crossfade 拼接 (fade=${CROSSFADE_SAMPLES} samples)...`);
  const merged = crossfadeMerge(floatChunks, CROSSFADE_SAMPLES);

  // 编码回 Int16 PCM
  const result = float32ToPcm(merged);
  console.log(`[TTS] 完成，总 PCM: ${(result.byteLength / 1024).toFixed(1)} KB`);
  return result;
};
