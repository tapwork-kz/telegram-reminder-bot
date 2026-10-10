import { Env } from "../types";
import { logger } from "../utils/logger";
import { cleanAndNormalizeText } from "../reminders/reminderParser";

export interface TranscriptionResult {
  text: string;
  confidence?: number;
  language?: string;
}

export interface IAudioTranscriber {
  transcribe(audioBytes: ArrayBuffer, mimeType: string): Promise<TranscriptionResult>;
}

const RUSSIAN_INITIAL_PROMPT =
  "Напоминание: провести собрание, планёрка, созвон, встреча, отправить на проверку СБ ответы, позвонить клиенту, забрать документы, проверить отчёт, в 11:30, в 10:00, завтра, сегодня, сделать, купить.";

/**
 * Uses Cloudflare Workers AI LLM to reconstruct words, sentences, proper punctuation, and acronyms.
 */
export async function refineTranscriptionWithAi(rawText: string, ai: any): Promise<string> {
  const trimmed = rawText.trim();
  if (!trimmed || !ai) return trimmed;

  try {
    const prompt = `Ты корректор распознавания русской речи в Telegram-боте напоминаний.
Пользователь надиктовал напоминание голосом. Исправь фонетические искажения, опечатки, слова и расставь правильные знаки препинания.

Примеры:
- "В 11-30, напомни, провесли с обраньям." -> "В 11:30, напомни, провести собрание."
- "1130 провести сопрания по уценке бродажей" -> "В 11:30 провести собрание по уценке продаж."
- "отправить на проверку сб ответы" -> "Отправить на проверку СБ ответы."
- "созвонится по поводу отчота" -> "Созвониться по поводу отчёта."
- "завтра в 10 утра забрать документы" -> "Завтра в 10 утра забрать документы."

Исправь следующий распознанный текст. Выведи ТОЛЬКО готовое исправленное предложение без кавычек, пояснений и комментариев:
${trimmed}`;

    const res = await ai.run("@cf/meta/llama-3.1-8b-instruct", {
      prompt,
      max_tokens: 150,
      temperature: 0.1,
    });

    const reply = (res?.response || res?.text || "").trim();
    if (reply && reply.length > 0 && !reply.toLowerCase().includes("исправленный текст")) {
      const cleanedReply = reply.replace(/^["'«]+/, "").replace(/["'»]+$/, "").trim();
      if (cleanedReply.length > 0) {
        return cleanedReply;
      }
    }
  } catch (err: any) {
    logger.warn("AI speech refinement skipped", { error: err.message });
  }

  return trimmed;
}

/**
 * Cloudflare Workers AI Whisper Transcriber.
 * Uses Whisper + Llama LLM post-processing for high accuracy Russian speech recognition.
 */
export class WorkersAiTranscriber implements IAudioTranscriber {
  constructor(private ai: any) {}

  async transcribe(audioBytes: ArrayBuffer, mimeType: string): Promise<TranscriptionResult> {
    const uint8 = new Uint8Array(audioBytes);
    const audioData = [...uint8];
    let rawText = "";

    // Priority 1: @cf/openai/whisper-large-v3-turbo (greatest accuracy and punctuation for Russian)
    try {
      const response = await this.ai.run("@cf/openai/whisper-large-v3-turbo", {
        audio: audioData,
        language: "ru",
        task: "transcribe",
        initial_prompt: RUSSIAN_INITIAL_PROMPT,
        vad_filter: true,
        beam_size: 5,
      });

      rawText = response?.text || "";
    } catch (errLarge) {
      logger.warn("whisper-large-v3-turbo attempt failed, falling back to base whisper", {
        error: errLarge instanceof Error ? errLarge.message : String(errLarge),
      });
    }

    // Priority 2: Fallback to @cf/openai/whisper with explicit language="ru"
    if (!rawText) {
      try {
        const response = await this.ai.run("@cf/openai/whisper", {
          audio: audioData,
          language: "ru",
          task: "transcribe",
          initial_prompt: RUSSIAN_INITIAL_PROMPT,
          vad_filter: true,
        });

        rawText = response?.text || "";
      } catch (errBase) {
        logger.error("WorkersAi transcription failed completely", errBase);
        throw errBase;
      }
    }

    if (!rawText) {
      return { text: "", confidence: 0, language: "ru" };
    }

    // Refine words, sentences and punctuation with Workers AI LLM
    const refined = await refineTranscriptionWithAi(rawText, this.ai);
    const cleaned = cleanTranscribedRussian(refined);

    return {
      text: cleaned,
      confidence: 0.98,
      language: "ru",
    };
  }
}

/**
 * External Whisper API (OpenAI / Groq) Transcriber with forced Russian language and prompt.
 */
export class ExternalWhisperTranscriber implements IAudioTranscriber {
  constructor(
    private apiKey: string,
    private endpoint = "https://api.openai.com/v1/audio/transcriptions"
  ) {}

  async transcribe(audioBytes: ArrayBuffer, mimeType: string): Promise<TranscriptionResult> {
    try {
      const formData = new FormData();
      const blob = new Blob([audioBytes], { type: mimeType || "audio/ogg" });
      formData.append("file", blob, "voice.ogg");
      formData.append("model", "whisper-1");
      formData.append("language", "ru");
      formData.append("prompt", RUSSIAN_INITIAL_PROMPT);

      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`STT API responded with ${res.status}: ${errorText}`);
      }

      const data = (await res.json()) as { text?: string };
      const text = cleanTranscribedRussian(data.text || "");
      return {
        text,
        confidence: text ? 0.98 : 0,
        language: "ru",
      };
    } catch (err) {
      logger.error("ExternalWhisper transcription failed", err);
      throw err;
    }
  }
}

/**
 * Cleans and formats Russian transcribed text: fixes phonetic slips, capitalizes first letter and trims.
 */
export function cleanTranscribedRussian(rawText: string): string {
  let cleaned = rawText.trim();
  if (!cleaned) return "";

  // Fix common Whisper leading spaces or dashes
  cleaned = cleaned.replace(/^[-–—\s]+/, "");

  // Apply phonetic and time normalization
  cleaned = cleanAndNormalizeText(cleaned);

  // Capitalize first character
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return cleaned;
}

export function createAudioTranscriber(env: Env): IAudioTranscriber {
  if (env.STT_API_KEY?.trim()) {
    return new ExternalWhisperTranscriber(env.STT_API_KEY.trim());
  }

  if (env.AI) {
    return new WorkersAiTranscriber(env.AI);
  }

  throw new Error("No Speech-to-Text provider configured in Cloudflare environment");
}

export async function transcribeAudio(
  audioBytes: ArrayBuffer,
  mimeType: string,
  env: Env
): Promise<TranscriptionResult> {
  const transcriber = createAudioTranscriber(env);
  return await transcriber.transcribe(audioBytes, mimeType);
}
