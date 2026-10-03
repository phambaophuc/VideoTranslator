export type VideoProcessingStep =
  | 'queued'
  | 'extracting'
  | 'transcribing'
  | 'preparing_subtitles'
  | 'translating'
  | 'rendering'
  | 'completed'
  | 'failed';

export interface VideoProcessingProgress {
  progress: number;
  step: VideoProcessingStep;
  message: string;
}
