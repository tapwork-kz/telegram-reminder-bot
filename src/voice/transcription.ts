import { Env } from "../types";
import { logger } from "../utils/logger";

export interface TranscriptionResult {
  text: string;
  confidence?: number;
  language?: string;
}

export interface IAudioTranscriber {
  transcribe(audioBytes: ArrayBuffer, mimeType: string): Promise<TranscriptionResult>;
}

/**
 * Cloudflare Workers AI Whisper Transcriber.
 * Runs directly on Cloudflare Edge without external network calls or external API keys.
 */
export class WorkersAiTranscriber implements IAudioTranscriber {
  constructor(private ai: any) {}

  async transcribe(audioBytes: ArrayBuffer, mimeType: string): Promise<TranscriptionResult> {
    try {
      const uint8 = new Uint8Array(audioBytes);
      // Run @cf/openai/whisper model
      const response = await this.ai.run("@cf/openai/whisper", {
        audio: [...uint8],
      });

      const text = response?.text?.trim() || "";
      return {
        text,
        confidence: text ? 0.95 : 0,
      };
    } catch (err) {
      logger.error("WorkersAi transcription failed", err);
      throw err;
    }
  }
}

/**
 * OpenAI / Groq Compatible External Whisper Transcriber.
 * Used if STT_API_KEY is configured.
 */
export class ExternalWhisperTranscriber implements IAudioTranscriber {
  constructor(private apiKey: string, private endpoint = "https://api.openai.com/v1/audio/transcriptions") {}

  async transcribe(audioBytes: ArrayBuffer, mimeType: string): Promise<TranscriptionResult> {
    try {
      const formData = new FormData();
      const blob = new Blob([audioBytes], { type: mimeType || "audio/ogg" });
      formData.append("file", blob, "voice.ogg");
      formData.append("model", "whisper-1");
      formData.append("language", "ru");

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
      const text = data.text?.trim() || "";
      return {
        text,
        confidence: text ? 0.95 : 0,
      };
    } catch (err) {
      logger.error("ExternalWhisper transcription failed", err);
      throw err;
    }
  }
}

/**
 * Factory for creating the appropriate AudioTranscriber based on environment bindings.
 */
export function createAudioTranscriber(env: Env): IAudioTranscriber {
  if (env.STT_API_KEY?.trim()) {
    return new ExternalWhisperTranscriber(env.STT_API_KEY.trim());
  }

  if (env.AI) {
    return new WorkersAiTranscriber(env.AI);
  }

  throw new Error("No Speech-to-Text provider configured (neither Cloudflare AI binding nor STT_API_KEY is present)");
}

/**
 * Public helper to transcribe audio bytes.
 */
export async function transcribeAudio(
  audioBytes: ArrayBuffer,
  mimeType: string,
  env: Env
): Promise<TranscriptionResult> {
  const transcriber = createAudioTranscriber(env);
  return await transcriber.transcribe(audioBytes, mimeType);
}
