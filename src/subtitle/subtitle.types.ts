export interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  text: string;

  avg_logprob?: number;
  no_speech_prob?: number;
  compression_ratio?: number;
}

export interface SubtitleSegment {
  sequence: number;
  start: number;
  end: number;
  text: string;
}
