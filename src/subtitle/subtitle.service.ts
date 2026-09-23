import { Injectable } from '@nestjs/common';
import {
  WhisperSegment,
  WhisperWord,
} from '../transcription/transcription.types';
import { SubtitleSegment } from './subtitle.types';

@Injectable()
export class SubtitleService {
  private readonly MAX_CHARS_PER_LINE = 42;
  private readonly MAX_LINES = 2;
  private readonly MAX_CHARS = this.MAX_CHARS_PER_LINE * this.MAX_LINES;
  private readonly MAX_CPS = 20;
  private readonly MIN_DURATION = 1;

  private normalizeText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  private cleanPunctuation(text: string): string {
    return text.replace(/\s+([,.!?;:])/g, '$1').trim();
  }

  private shouldSplit(
    currentText: string,
    nextWord: WhisperWord,
    currentStart: number,
  ): boolean {
    const candidate = `${currentText} ${nextWord.word}`.trim();

    const duration = nextWord.end - currentStart;

    const cps = candidate.length / Math.max(duration, 0.1);

    if (candidate.length > this.MAX_CHARS) {
      return true;
    }

    if (cps > this.MAX_CPS) {
      return true;
    }

    return false;
  }

  private isNaturalBreak(word: string): boolean {
    return /[.!?,;:]$/.test(word.trim());
  }

  private buildText(words: WhisperWord[]): string {
    return this.cleanPunctuation(
      this.normalizeText(words.map((word) => word.word).join(' ')),
    );
  }

  private splitSegment(segment: WhisperSegment): SubtitleSegment[] {
    if (!segment.words || segment.words.length === 0) {
      return [
        {
          sequence: 0,
          start: segment.start,
          end: segment.end,
          text: this.cleanPunctuation(this.normalizeText(segment.text)),
        },
      ];
    }

    const result: SubtitleSegment[] = [];
    let currentWords: WhisperWord[] = [];

    for (const word of segment.words) {
      if (currentWords.length === 0) {
        currentWords.push(word);
        continue;
      }

      const currentText = this.buildText(currentWords);
      const shouldSplit = this.shouldSplit(
        currentText,
        word,
        currentWords[0].start,
      );

      if (shouldSplit) {
        result.push({
          sequence: 0,
          start: currentWords[0].start,
          end: currentWords[currentWords.length - 1].end,
          text: currentText,
        });

        currentWords = [word];

        continue;
      }

      currentWords.push(word);

      if (this.isNaturalBreak(word.word) && currentWords.length >= 3) {
        const duration =
          currentWords[currentWords.length - 1].end - currentWords[0].start;

        if (duration >= this.MIN_DURATION) {
          result.push({
            sequence: 0,
            start: currentWords[0].start,
            end: currentWords[currentWords.length - 1].end,
            text: this.buildText(currentWords),
          });

          currentWords = [];
        }
      }
    }

    if (currentWords.length > 0) {
      result.push({
        sequence: 0,
        start: currentWords[0].start,
        end: currentWords[currentWords.length - 1].end,
        text: this.buildText(currentWords),
      });
    }

    return result;
  }

  createSubtitleSegments(segments: WhisperSegment[]): SubtitleSegment[] {
    const subtitles: SubtitleSegment[] = [];

    for (const segment of segments) {
      const chunks = this.splitSegment(segment);

      subtitles.push(...chunks);
    }

    return subtitles
      .filter(
        (subtitle) => subtitle.text.length > 0 && subtitle.end > subtitle.start,
      )
      .map((subtitle, index) => ({
        ...subtitle,
        sequence: index + 1,
      }));
  }

  private formatTimestamp(seconds: number): string {
    const totalMilliseconds = Math.round(seconds * 1000);
    const hours = Math.floor(totalMilliseconds / 3_600_000);
    const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
    const secs = Math.floor((totalMilliseconds % 60_000) / 1000);
    const milliseconds = totalMilliseconds % 1000;

    return (
      `${hours.toString().padStart(2, '0')}:` +
      `${minutes.toString().padStart(2, '0')}:` +
      `${secs.toString().padStart(2, '0')},` +
      milliseconds.toString().padStart(3, '0')
    );
  }

  generateSrt(segments: SubtitleSegment[]): string {
    return segments
      .map((segment) => {
        const start = this.formatTimestamp(segment.start);
        const end = this.formatTimestamp(segment.end);

        return [segment.sequence, `${start} --> ${end}`, segment.text].join(
          '\n',
        );
      })
      .join('\n\n');
  }
}
