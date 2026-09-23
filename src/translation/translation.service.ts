import { Injectable, InternalServerErrorException } from '@nestjs/common';

import Groq from 'groq-sdk';

import { SubtitleSegment } from '../subtitle/subtitle.types';

@Injectable()
export class TranslationService {
  private readonly groq: Groq;
  private readonly model = 'openai/gpt-oss-120b';

  constructor() {
    this.groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
  }

  async translateBatch(
    subtitles: SubtitleSegment[],
  ): Promise<SubtitleSegment[]> {
    if (subtitles.length === 0) {
      return [];
    }

    const input = subtitles
      .map((subtitle) => `[${subtitle.sequence}] ${subtitle.text}`)
      .join('\n');

    try {
      const result = await this.groq.chat.completions.create({
        model: this.model,

        temperature: 0.2,

        messages: [
          {
            role: 'system',
            content: `
              You are a professional subtitle translator.

              Translate subtitles into natural Vietnamese.

              Rules:
              - Preserve the meaning.
              - Do not add explanations.
              - Do not remove subtitle items.
              - Keep the exact subtitle numbers.
              - Return exactly one translated line for each subtitle.
              - Do not merge subtitles.
              - Do not split subtitles.
              - Do not change the numbers.
              - Keep names, brands, technical terms and proper nouns accurate.
              - Make Vietnamese sound natural for spoken dialogue.

              Output format:

              [1] Vietnamese translation
              [2] Vietnamese translation
              [3] Vietnamese translation
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

      return this.mergeTranslations(subtitles, content);
    } catch (error) {
      console.error('Translation error:', error);

      throw new InternalServerErrorException('Failed to translate subtitles');
    }
  }

  private mergeTranslations(
    subtitles: SubtitleSegment[],
    translatedText: string,
  ): SubtitleSegment[] {
    const translations = new Map<number, string>();

    for (const line of translatedText.split('\n')) {
      const match = line.match(/^\s*\[(\d+)\]\s*(.+)\s*$/);

      if (!match) {
        continue;
      }

      const sequence = Number(match[1]);
      const text = match[2].trim();

      if (text.length > 0) {
        translations.set(sequence, text);
      }
    }

    return subtitles.map((subtitle) => ({
      ...subtitle,

      text: translations.get(subtitle.sequence) ?? subtitle.text,
    }));
  }
}
