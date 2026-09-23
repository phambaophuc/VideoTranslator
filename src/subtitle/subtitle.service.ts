import { Injectable } from '@nestjs/common';
import { SubtitleSegment, TranscriptSegment } from './subtitle.types';

@Injectable()
export class SubtitleService {
  private normalizeText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  private cleanPunctuation(text: string): string {
    return text.replace(/\s+([,.!?;:])/g, '$1').trim();
  }

  private formatTimestamp(seconds: number): string {
    const milliseconds = Math.round((seconds % 1) * 1000);
    const totalSeconds = Math.floor(seconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    return (
      [
        hours.toString().padStart(2, '0'),
        minutes.toString().padStart(2, '0'),
        secs.toString().padStart(2, '0'),
      ].join(':') + `,${milliseconds.toString().padStart(3, '0')}`
    );
  }

  createSubtitleSegments(segments: TranscriptSegment[]): SubtitleSegment[] {
    return segments
      .map((segment, index) => {
        const text = this.cleanPunctuation(this.normalizeText(segment.text));

        return {
          sequence: index + 1,
          start: segment.start,
          end: segment.end,
          text,
        };
      })
      .filter((segment) => segment.text.length > 0);
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
