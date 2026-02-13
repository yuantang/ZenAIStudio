
import { GoogleGenAI, Type, Modality, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { SYSTEM_PROMPT, TTS_SYSTEM_INSTRUCTION } from "../constants";
import { MeditationScript } from "../types";

function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 核心脚本生成器：利用 Gemini 3 Pro 生成具备临床深度和艺术美感的冥想剧本
 */
export const generateMeditationScript = async (theme: string, durationMinutes: number = 10, retries = 2): Promise<MeditationScript> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API_KEY 尚未配置。");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview', 
      contents: `请根据以下主题生成一份顶级的冥想引导脚本，确保其具备深度的疗愈价值和科学的放松节奏。

【目标时长】：${durationMinutes} 分钟（请根据时长严格控制内容篇幅和段落数量，语音朗读总时长加上停顿时间应尽可能接近 ${durationMinutes} 分钟）

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
                  pauseSeconds: { type: Type.NUMBER }
                },
                required: ["type", "content", "pauseSeconds"]
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
    if (!text) throw new Error("模型未返回有效内容");
    return JSON.parse(text.trim());
  } catch (error: any) {
    if (retries > 0) {
      await wait(2000);
      return generateMeditationScript(theme, retries - 1);
    }
    throw error;
  }
};

/**
 * 合成大师级冥想语音 (Initial TTS Model)
 */
export const synthesizeSpeech = async (text: string, voiceName: string, retries = 2): Promise<Uint8Array> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API_KEY 尚未配置。");
  }

  const ai = new GoogleGenAI({ apiKey });
  const targetVoice = voiceName || 'Zephyr';

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { 
              voiceName: targetVoice 
            }
          }
        }
      }
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      throw new Error("TTS 引擎未能返回音频数据。");
    }

    return decodeBase64(base64Audio);
  } catch (error: any) {
    if (retries > 0) {
      await wait(1500);
      return synthesizeSpeech(text, voiceName, retries - 1);
    }
    throw error;
  }
};

/**
 * 为段落添加过渡标记文本
 */
const addTransitionMarker = (text: string, pauseSeconds: number): string => {
  if (pauseSeconds >= 15) {
    return text + '\n\n……现在，请在这片宁静中，安静地与自己相处……\n\n';
  } else if (pauseSeconds >= 8) {
    return text + '\n\n……深深地吸气……缓缓地呼出……\n\n';
  } else {
    return text + '\n\n……\n\n';
  }
};

/**
 * 单次 TTS 调用（内部工具函数）
 */
const callTTS = async (
  ai: GoogleGenAI,
  text: string,
  voiceName: string,
  retries = 2
): Promise<Uint8Array> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
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
    if (!base64Audio) {
      throw new Error("TTS 引擎未能返回音频数据。");
    }
    return decodeBase64(base64Audio);
  } catch (error: any) {
    if (retries > 0) {
      await wait(2000);
      return callTTS(ai, text, voiceName, retries - 1);
    }
    throw error;
  }
};

// 分批阈值：超过此字数则自动分批合成
const BATCH_CHAR_THRESHOLD = 1500;
// 每批目标字数（留足余量）
const BATCH_TARGET_SIZE = 1200;

/**
 * 整篇冥想脚本合成：短文本单次调用；长文本自动分批合成后拼接 PCM
 */
export const synthesizeFullMeditation = async (
  script: MeditationScript, 
  voiceName: string, 
  retries = 2
): Promise<Uint8Array> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API_KEY 尚未配置。");
  }

  const ai = new GoogleGenAI({ apiKey });
  const targetVoice = voiceName || 'Zephyr';

  // 构建带过渡标记的段落文本数组
  const sectionTexts = script.sections.map((section, idx) => {
    let text = section.content;
    if (idx < script.sections.length - 1) {
      text = addTransitionMarker(text, section.pauseSeconds || 3);
    }
    return text;
  });

  const fullText = sectionTexts.join('');

  // 短文本：单次调用
  if (fullText.length <= BATCH_CHAR_THRESHOLD) {
    console.log(`[TTS] 单次合成模式 (${fullText.length} 字)`);
    return callTTS(ai, fullText, targetVoice, retries);
  }

  // 长文本：分批合成
  console.log(`[TTS] 分批合成模式 (${fullText.length} 字，阈值 ${BATCH_CHAR_THRESHOLD})`);
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
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  console.log(`[TTS] 分为 ${batches.length} 批次: [${batches.map(b => b.length + '字').join(', ')}]`);

  // 顺序合成每批（保持声纹连贯性）
  const audioChunks: Uint8Array[] = [];
  for (let i = 0; i < batches.length; i++) {
    console.log(`[TTS] 正在合成第 ${i + 1}/${batches.length} 批...`);
    const chunk = await callTTS(ai, batches[i], targetVoice, retries);
    audioChunks.push(chunk);
    // 批次间短暂间隔，避免 API 速率限制
    if (i < batches.length - 1) {
      await wait(500);
    }
  }

  // 拼接所有 PCM 数据
  const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of audioChunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  console.log(`[TTS] 分批合成完成，总 PCM 大小: ${(totalLength / 1024).toFixed(1)} KB`);
  return merged;
};
