export interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

export interface WhisperSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  words?: WhisperWord[];

  avg_logprob?: number;
  no_speech_prob?: number;
  compression_ratio?: number;
}

export interface WhisperTranscription {
  text: string;
  segments: WhisperSegment[];
}
