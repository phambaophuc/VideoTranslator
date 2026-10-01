import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createReadStream } from 'fs';
import Groq from 'groq-sdk';

import { WhisperSegment, WhisperTranscription, WhisperWord } from './transcription.types';

@Injectable()
export class TranscriptionService {
  private readonly groq: Groq;

  constructor() {
    this.groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
  }

  async transcribe(audioPath: string, offset = 0): Promise<WhisperTranscription> {
    try {
      const raw = (await this.groq.audio.transcriptions.create({
        file: createReadStream(audioPath),
        model: 'whisper-large-v3',
        response_format: 'verbose_json',
        timestamp_granularities: ['segment', 'word'],
        temperature: 0,
      })) as unknown as WhisperTranscription;

      return this.normalize(raw, offset);
    } catch (error) {
      console.error('Whisper error:', error);
      throw new InternalServerErrorException('Failed to transcribe audio');
    }
  }

  private normalize(t: WhisperTranscription, offset: number): WhisperTranscription {
    const shift = <T extends { start: number; end: number }>(x: T): T => ({
      ...x,
      start: x.start + offset,
      end: x.end + offset,
    });

    const words = t.words?.map(shift);
    let segments: WhisperSegment[] = (t.segments ?? []).map((s) => ({
      ...shift(s),
      words: s.words?.map(shift),
    }));

    if (words?.length && segments.every((s) => !s.words?.length)) {
      segments = this.attachWords(segments, words);
    }

    segments = segments.filter(
      (s) => !((s.no_speech_prob ?? 0) > 0.6 && (s.avg_logprob ?? 0) < -1),
    );

    return { ...t, words, segments };
  }

  private attachWords(segments: WhisperSegment[], words: WhisperWord[]): WhisperSegment[] {
    if (segments.length === 0) return segments;

    const out = segments.map((s) => ({ ...s, words: [] as WhisperWord[] }));
    let i = 0;
    for (const word of words) {
      const mid = (word.start + word.end) / 2;
      while (i < out.length - 1 && mid >= out[i].end) i++;
      out[i].words.push(word);
    }
    return out;
  }
}
