import { Injectable } from '@nestjs/common';
import { VideoProcessingProgress } from './video-processing.types';
import { Observable, Subject } from 'rxjs';

export interface VideoProgressEvent extends VideoProcessingProgress {
  videoId: string;
}

@Injectable()
export class VideoProgressService {
  private readonly subjects = new Map<string, Subject<VideoProgressEvent>>();
  private readonly latest = new Map<string, VideoProgressEvent>();

  getStream(videoId: string): Observable<VideoProgressEvent> {
    return this.getSubject(videoId).asObservable();
  }

  getLatest(videoId: string): VideoProgressEvent | undefined {
    return this.latest.get(videoId);
  }

  publish(videoId: string, progress: VideoProcessingProgress): void {
    const event: VideoProgressEvent = {
      videoId,
      ...progress,
    };

    this.latest.set(videoId, event);
    this.getSubject(videoId).next(event);
  }

  complete(videoId: string): void {
    const subject = this.subjects.get(videoId);
    if (!subject) {
      return;
    }

    subject.complete();
    this.subjects.delete(videoId);
  }

  private getSubject(videoId: string): Subject<VideoProgressEvent> {
    let subject = this.subjects.get(videoId);
    if (!subject) {
      subject = new Subject<VideoProgressEvent>();
      this.subjects.set(videoId, subject);
    }

    return subject;
  }
}
