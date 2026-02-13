
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
 * 整篇冥想脚本一次性合成：将所有段落合并为连贯文本，单次 TTS 调用确保声纹一致
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

  // 将所有段落合并为一个连贯的文本，段落间嵌入自然停顿标记
  const fullText = script.sections.map((section, idx) => {
    let text = section.content;
    // 在段落之间插入呼吸停顿标记，让 TTS 自然处理过渡
    if (idx < script.sections.length - 1) {
      const pauseDuration = section.pauseSeconds || 3;
      if (pauseDuration >= 15) {
        // 长停顿：深度静默意象
        text += '\n\n……现在，请在这片宁静中，安静地与自己相处……\n\n';
      } else if (pauseDuration >= 8) {
        // 中等停顿：呼吸过渡
        text += '\n\n……深深地吸气……缓缓地呼出……\n\n';
      } else {
        // 短停顿：自然衔接
        text += '\n\n……\n\n';
      }
    }
    return text;
  }).join('');

  const ai = new GoogleGenAI({ apiKey });
  const targetVoice = voiceName || 'Zephyr';

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: fullText }] }],
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
      await wait(2000);
      return synthesizeFullMeditation(script, voiceName, retries - 1);
    }
    throw error;
  }
};
