
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { SYSTEM_PROMPT, TTS_SYSTEM_INSTRUCTION } from "../constants";
import { MeditationScript } from "../types";

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

/**
 * 核心脚本生成器 - 优化稳定性
 */
export const generateMeditationScript = async (
  theme: string, 
  retries = 3
): Promise<MeditationScript> => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key 未配置");

  const ai = new GoogleGenAI({ apiKey });
  // 500 错误多发于 Pro 模型，此处默认使用 Flash 提升成功率
  const modelName = retries < 2 ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';
  
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: `Generate a professional meditation script for theme: ${theme}`,
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
                  type: { type: Type.STRING, description: "Type of section" },
                  content: { type: Type.STRING, description: "Spoken content" },
                  pauseSeconds: { type: Type.NUMBER, description: "Silence after" }
                },
                required: ["type", "content", "pauseSeconds"]
              }
            }
          },
          required: ["title", "sections"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("Empty response");
    return JSON.parse(text.trim());
  } catch (error: any) {
    if (retries > 0) {
      const delay = (4 - retries) * 3000;
      await wait(delay);
      return generateMeditationScript(theme, retries - 1);
    }
    throw error;
  }
};

/**
 * TTS 合成 - 增加容错
 */
export const synthesizeSpeech = async (text: string, voiceName: string, retries = 2): Promise<Uint8Array> => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key 未配置");

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
            prebuiltVoiceConfig: { voiceName: targetVoice }
          }
        }
      }
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("TTS Failure");
    return decodeBase64(base64Audio);
  } catch (error: any) {
    if (retries > 0) {
      await wait(2000);
      return synthesizeSpeech(text, voiceName, retries - 1);
    }
    throw error;
  }
};
