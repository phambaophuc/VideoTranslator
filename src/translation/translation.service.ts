import { Injectable, InternalServerErrorException } from '@nestjs/common';
import Groq from 'groq-sdk';

import { SubtitleSegment } from '../subtitle/subtitle.types';

@Injectable()
export class TranslationService {
  private readonly groq: Groq;
  private readonly model = 'openai/gpt-oss-120b';
  private readonly BATCH_SIZE = 30;
  private readonly MAX_RETRIES = 2;

  constructor() {
    this.groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
  }

  async translateBatch(
    subtitles: SubtitleSegment[],
    targetLanguage = 'Vietnamese',
  ): Promise<SubtitleSegment[]> {
    if (subtitles.length === 0) {
      return [];
    }

    const results: SubtitleSegment[] = [];

    for (let i = 0; i < subtitles.length; i += this.BATCH_SIZE) {
      const batch = subtitles.slice(i, i + this.BATCH_SIZE);
      const translatedBatch = await this.translateWithRetry(batch, targetLanguage);

      results.push(...translatedBatch);
    }

    this.validateTranslations(subtitles, results);
    console.log(`[Translation] Completed ${results.length}/${subtitles.length} subtitles`);

    return results;
  }

  private async translateWithRetry(
    subtitles: SubtitleSegment[],
    targetLanguage: string,
  ): Promise<SubtitleSegment[]> {
    const done = new Map<number, string>();
    let pending = subtitles;

    for (let attempt = 1; attempt <= this.MAX_RETRIES + 1 && pending.length > 0; attempt++) {
      try {
        const translated = await this.translateOneBatch(pending, targetLanguage);
        for (const item of translated) {
          if (item.text.trim()) done.set(item.sequence, item.text);
        }
      } catch (error) {
        console.error(`[Translation] Attempt ${attempt} failed:`, error);
        if (attempt > this.MAX_RETRIES && done.size === 0) throw error;
      }

      pending = subtitles.filter((s) => !done.has(s.sequence));
      if (pending.length > 0 && attempt <= this.MAX_RETRIES) {
        console.warn(
          `[Translation] Missing: ${pending.map((s) => s.sequence).join(', ')}. Retrying...`,
        );
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt)); // backoff
      }
    }

    if (pending.length > 0) {
      console.warn(
        `[Translation] Falling back to original text for: ${pending.map((s) => s.sequence).join(', ')}`,
      );
    }

    return subtitles.map((s) => ({ ...s, text: done.get(s.sequence) ?? s.text }));
  }

  private async translateOneBatch(
    subtitles: SubtitleSegment[],
    targetLanguage: string,
  ): Promise<SubtitleSegment[]> {
    const input = subtitles.map((subtitle) => `[${subtitle.sequence}] ${subtitle.text}`).join('\n');

    const prompt = `
      You are a professional subtitle translator.

      Translate the subtitles into natural ${targetLanguage}.

      STRICT RULES:

      1. Translate EVERY subtitle.
      2. Do not skip any subtitle.
      3. Keep the exact subtitle number.
      4. Return exactly one line for every input subtitle.
      5. Do not merge subtitles.
      6. Do not split subtitles.
      7. Do not change subtitle numbers.
      8. Do not add explanations.
      9. Do not add commentary.
      10. Keep names, brands, technical terms and proper nouns accurate.
      11. Make ${targetLanguage} natural for spoken dialogue.
      12. Keep translations concise enough for subtitles.

      IMPORTANT:

      If the input contains:

      [101] Hello
      [102] How are you?
      [103] I'm fine.

      You MUST return exactly one line per subtitle, in ${targetLanguage}:

      [101] <${targetLanguage} translation of Hello>
      [102] <${targetLanguage} translation of How are you?>
      [103] <${targetLanguage} translation of I'm fine.>

      Return ONLY the translations.

      No markdown.
      No code block.
      No extra text.
      `.trim();

    try {
      const result = await this.groq.chat.completions.create({
        model: this.model,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: prompt,
          },
          {
            role: 'user',
            content: input,
          },
        ],
      });

      const content = result.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty translation response');
      }

      return this.parseTranslations(subtitles, content);
    } catch (error) {
      console.error('[Translation] Groq error:', error);
      throw new InternalServerErrorException('Failed to translate subtitle batch');
    }
  }

  private parseTranslations(
    subtitles: SubtitleSegment[],
    translatedText: string,
  ): SubtitleSegment[] {
    const translations = new Map<number, string>();

    for (const line of translatedText.split('\n')) {
      const match = line.match(/^\s*\[(\d+)\]\s*(.+?)\s*$/);

      if (!match) {
        continue;
      }

      const sequence = Number(match[1]);
      const text = match[2].trim();

      if (!text) {
        continue;
      }

      translations.set(sequence, text);
    }

    return subtitles.map((subtitle) => {
      const translated = translations.get(subtitle.sequence);

      if (!translated) {
        return {
          ...subtitle,
          text: '',
        };
      }

      return {
        ...subtitle,
        text: translated,
      };
    });
  }

  private findMissingTranslations(translated: SubtitleSegment[]): SubtitleSegment[] {
    return translated.filter((subtitle) => !subtitle.text || subtitle.text.trim().length === 0);
  }

  private validateTranslations(original: SubtitleSegment[], translated: SubtitleSegment[]): void {
    if (original.length !== translated.length) {
      throw new Error(
        `Translation count mismatch. Expected ${original.length}, got ${translated.length}`,
      );
    }

    const missing = this.findMissingTranslations(translated);

    if (missing.length > 0) {
      throw new Error(
        `Translation incomplete. Missing subtitles: ${missing
          .map((subtitle) => subtitle.sequence)
          .join(', ')}`,
      );
    }

    const originalSequences = original.map((subtitle) => subtitle.sequence);

    const translatedSequences = translated.map((subtitle) => subtitle.sequence);

    for (let i = 0; i < originalSequences.length; i++) {
      if (originalSequences[i] !== translatedSequences[i]) {
        throw new Error(
          `Subtitle sequence mismatch at index ${i}. Expected ${originalSequences[i]}, got ${translatedSequences[i]}`,
        );
      }
    }
  }
}
