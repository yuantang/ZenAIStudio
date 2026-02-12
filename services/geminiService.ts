
import { GoogleGenAI, Type, Modality } from "@google/genai";
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
export const generateMeditationScript = async (theme: string, retries = 2): Promise<MeditationScript> => {
  // 延迟初始化，确保 process.env.API_KEY 已注入
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API_KEY 尚未配置。请点击顶部的“配置密钥”按钮或在环境变量中设置。");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview', // 升级为 Pro 以获得更深度的剧本创作能力
      contents: `请根据以下主题生成一份顶级的冥想引导脚本，确保其具备深度的疗愈价值和科学的放松节奏：\n\n主题：${theme}`,
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
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("模型未返回有效内容");
    return JSON.parse(text.trim());
  } catch (error) {
    if (retries > 0) {
      console.warn(`脚本生成失败，正在重试... 剩余次数: ${retries}`);
      await wait(2000);
      return generateMeditationScript(theme, retries - 1);
    }
    throw error;
  }
};

/**
 * 合成大师级冥想语音 (High-Fidelity TTS)
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
        systemInstruction: TTS_SYSTEM_INSTRUCTION,
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
  } catch (error) {
    if (retries > 0) {
      console.warn(`TTS 合成失败，正在重试...`);
      await wait(1500);
      return synthesizeSpeech(text, voiceName, retries - 1);
    }
    throw error;
  }
};
