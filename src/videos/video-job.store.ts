import { Injectable } from '@nestjs/common';

interface VideoJobInfo {
  videoId: string;
  jobId: string;
}

@Injectable()
export class VideoJobStore {
  private readonly jobs = new Map<string, VideoJobInfo>();

  set(videoId: string, jobId: string): void {
    this.jobs.set(videoId, {
      videoId,
      jobId,
    });
  }

  get(videoId: string): VideoJobInfo | undefined {
    return this.jobs.get(videoId);
  }
}
