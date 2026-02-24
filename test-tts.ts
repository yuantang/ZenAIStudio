import { GoogleGenAI, Modality } from "@google/genai";
import * as fs from 'fs';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

async function checkModels() {
  const models = [
    "gemini-2.5-flash",
    "gemini-2.0-flash", 
    "gemini-2.0-flash-exp",
    "gemini-2.0-flash-lite-preview-02-05",
    "gemini-2.5-pro"
  ];

  for (const model of models) {
    console.log(`Testing ${model}...`);
    try {
      await ai.models.generateContent({
        model: model,
        contents: "test",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } }
        }
      });
      console.log(`✅ ${model} supports Audio`);
    } catch (e: any) {
      console.log(`❌ ${model} failed: ${e.message}`);
    }
  }
}
checkModels();
