import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { VideoJobStore } from './video-job.store';

@Injectable()
export class VideosService {
  constructor(
    @InjectQueue('transcription')
    private readonly transcriptionQueue: Queue,
    private readonly videoJobStore: VideoJobStore,
  ) {}

  async create(file: Express.Multer.File) {
    const videoId = randomUUID();

    const job = await this.transcriptionQueue.add('transcribe-video', {
      videoId,
      filePath: file.path,
      originalName: file.originalname,
    });

    this.videoJobStore.set(videoId, String(job.id));

    return {
      videoId,
      jobId: job.id,
      status: 'queued',
    };
  }

  async getStatus(videoId: string) {
    const videoJob = this.videoJobStore.get(videoId);
    if (!videoJob) {
      throw new NotFoundException('Video not found.');
    }

    const job = await this.transcriptionQueue.getJob(videoJob.jobId);
    if (!job) {
      throw new NotFoundException('Video processing job not found.');
    }

    const state = await job.getState();
    const progress = typeof job.progress === 'number' ? job.progress : 0;

    return {
      videoId,
      jobId: job.id,
      status: state,
      progress,
    };
  }
}
