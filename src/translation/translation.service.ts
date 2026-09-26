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

  async translateBatch(subtitles: SubtitleSegment[]): Promise<SubtitleSegment[]> {
    if (subtitles.length === 0) {
      return [];
    }

    const results: SubtitleSegment[] = [];

    for (let i = 0; i < subtitles.length; i += this.BATCH_SIZE) {
      const batch = subtitles.slice(i, i + this.BATCH_SIZE);

      console.log(
        `[Translation] Batch ${
          Math.floor(i / this.BATCH_SIZE) + 1
        } - subtitles ${i + 1}-${i + batch.length}/${subtitles.length}`,
      );

      const translatedBatch = await this.translateWithRetry(batch);

      results.push(...translatedBatch);
    }

    this.validateTranslations(subtitles, results);

    console.log(`[Translation] Completed ${results.length}/${subtitles.length} subtitles`);

    return results;
  }

  private async translateWithRetry(subtitles: SubtitleSegment[]): Promise<SubtitleSegment[]> {
    let lastResult: SubtitleSegment[] = [];

    for (let attempt = 1; attempt <= this.MAX_RETRIES + 1; attempt++) {
      console.log(
        `[Translation] Attempt ${attempt} for subtitles ${
          subtitles[0].sequence
        }-${subtitles[subtitles.length - 1].sequence}`,
      );

      try {
        const translated = await this.translateOneBatch(subtitles);

        const missing = this.findMissingTranslations(subtitles, translated);

        if (missing.length === 0) {
          return translated;
        }

        console.warn(
          `[Translation] Missing subtitles:`,
          missing.map((subtitle) => subtitle.sequence),
        );

        lastResult = translated;

        if (attempt <= this.MAX_RETRIES) {
          console.log(`[Translation] Retrying batch...`);
        }
      } catch (error) {
        console.error(`[Translation] Attempt ${attempt} failed:`, error);

        if (attempt > this.MAX_RETRIES) {
          throw error;
        }
      }
    }

    throw new Error(
      `Translation incomplete. Missing subtitles: ${this.findMissingTranslations(
        subtitles,
        lastResult,
      )
        .map((subtitle) => subtitle.sequence)
        .join(', ')}`,
    );
  }

  private async translateOneBatch(subtitles: SubtitleSegment[]): Promise<SubtitleSegment[]> {
    const input = subtitles.map((subtitle) => `[${subtitle.sequence}] ${subtitle.text}`).join('\n');

    try {
      const result = await this.groq.chat.completions.create({
        model: this.model,
        temperature: 0.2,

        messages: [
          {
            role: 'system',
            content: `
              You are a professional subtitle translator.

              Translate the subtitles into natural Vietnamese.

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
              11. Make Vietnamese natural for spoken dialogue.
              12. Keep translations concise enough for subtitles.

              IMPORTANT:

              If the input contains:

              [101] Hello
              [102] How are you?
              [103] I'm fine.

              You MUST return:

              [101] Xin chào
              [102] Bạn khỏe không?
              [103] Tôi khỏe.

              Return ONLY the translations.

              No markdown.
              No code block.
              No extra text.

              Format:

              [101] Vietnamese translation
              [102] Vietnamese translation
              [103] Vietnamese translation
              `.trim(),
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

  private findMissingTranslations(
    expected: SubtitleSegment[],
    translated: SubtitleSegment[],
  ): SubtitleSegment[] {
    return translated.filter((subtitle) => !subtitle.text || subtitle.text.trim().length === 0);
  }

  private validateTranslations(original: SubtitleSegment[], translated: SubtitleSegment[]): void {
    if (original.length !== translated.length) {
      throw new Error(
        `Translation count mismatch. Expected ${original.length}, got ${translated.length}`,
      );
    }

    const missing = this.findMissingTranslations(original, translated);

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
