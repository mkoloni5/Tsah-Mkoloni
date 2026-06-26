import { GoogleGenAI } from "@google/genai";
import { config } from '../config/index.js';

let genAI: GoogleGenAI | null = null;

const getGenAI = (): GoogleGenAI => {
  if (!genAI) {
    const key = config.geminiApiKey;
    if (!key) {
      throw new Error('GEMINI_API_KEY is not defined. Please configure it in Settings.');
    }
    genAI = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return genAI;
};

export const geminiAssistant = async (prompt: string, systemInstruction?: string) => {
  try {
    const ai = getGenAI();
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: prompt,
      config: {
        systemInstruction: systemInstruction || "You are a helpful WhatsApp assistant bot. Be concise and friendly.",
      },
    });
    return response.text;
  } catch (error) {
    console.error('Gemini API Error:', error);
    return null;
  }
};

export const generateImageDescription = async (imageUrl: string) => {
    // Logic for multimodality if needed
    return null;
}
