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
    let text = section.content;
    if (idx < script.sections.length - 1) {
      text = addTransitionMarker(text, section.pauseSeconds || 3, section.type);
    }
    return text;
  });

  const fullText = sectionTexts.join('');

  if (fullText.length <= BATCH_CHAR_THRESHOLD) {
    return callTTS(ai, fullText, targetVoice, retries);
  }

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

  const audioChunks: Uint8Array[] = [];
  for (let i = 0; i < batches.length; i++) {
    const chunk = await callTTS(ai, batches[i], targetVoice, retries);
    audioChunks.push(chunk);
    if (i < batches.length - 1) await wait(500);
  }

  const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of audioChunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
};
