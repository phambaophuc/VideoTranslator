import { Injectable, InternalServerErrorException } from '@nestjs/common';
import Groq from 'groq-sdk';
import { createReadStream } from 'fs';
import { WhisperTranscription } from './transcription.types';

@Injectable()
export class TranscriptionService {
  private readonly groq: Groq;

  constructor() {
    this.groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
  }

  async transcribe(audioPath: string) {
    try {
      const result = await this.groq.audio.transcriptions.create({
        file: createReadStream(audioPath),
        model: 'whisper-large-v3',
        response_format: 'verbose_json',
        timestamp_granularities: ['segment', 'word'],
        temperature: 0,
      });

      return result as unknown as WhisperTranscription;
    } catch (error) {
      console.error('Whisper error:', error);

      throw new InternalServerErrorException('Failed to transcribe audio');
    }
  }
}
