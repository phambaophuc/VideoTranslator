export type VideoProcessingStep =
  | 'queued'
  | 'extracting'
  | 'transcribing'
  | 'preparing_subtitles'
  | 'translating'
  | 'rendering'
  | 'completed';

export interface VideoProcessingProgress {
  progress: number;
  step: VideoProcessingStep;
  message: string;
}
