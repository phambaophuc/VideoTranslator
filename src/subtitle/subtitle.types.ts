export interface SubtitleSegment {
  sequence: number;
  start: number;
  end: number;
  text: string;
}

export interface SubtitleOptions {
  maxCharsPerLine?: number;
  maxLines?: number;
  maxCps?: number;
  minDuration?: number;
  maxDuration?: number;
  pauseSplit?: number;
  maxMergeGap?: number;
  minGap?: number;
}
