import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { rename } from 'fs/promises';
import { extname } from 'path';

import { StorageService } from '../storage/storage.service';
import { VideoJobStore } from './video-job.store';

@Injectable()
export class VideosService {
  constructor(
    @InjectQueue('transcription')
    private readonly transcriptionQueue: Queue,
    private readonly videoJobStore: VideoJobStore,
    private readonly storageService: StorageService,
  ) {}

  async create(file: Express.Multer.File) {
    const videoId = randomUUID();
    const extension = extname(file.originalname) || '.mp4';
    const uploadPath = this.storageService.getUploadPath(videoId, extension);

    await rename(file.path, uploadPath);

    const job = await this.transcriptionQueue.add('transcribe-video', {
      videoId,
      filePath: uploadPath,
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
      throw new NotFoundException('Video not found');
    }

    const job = await this.transcriptionQueue.getJob(videoJob.jobId);
    if (!job) {
      throw new NotFoundException('Video processing job not found');
    }

    const state = await job.getState();
    const jobProgress = job.progress;

    const progress =
      typeof jobProgress === 'object' && jobProgress !== null
        ? jobProgress
        : {
            progress: typeof jobProgress === 'number' ? jobProgress : 0,
            step: state,
            message: 'Processing video...',
          };

    return {
      videoId,
      jobId: job.id,
      status: state,
      ...progress,
    };
  }

  async getVideo(videoId: string) {
    const videoJob = this.videoJobStore.get(videoId);
    if (!videoJob) {
      throw new NotFoundException('Video not found');
    }

    const job = await this.transcriptionQueue.getJob(videoJob.jobId);
    if (!job) {
      throw new NotFoundException('Video processing job not found');
    }

    const state = await job.getState();
    const progress = typeof job.progress === 'number' ? job.progress : 0;

    if (state !== 'completed') {
      return {
        videoId,
        jobId: job.id,
        status: state,
        progress,
      };
    }

    const result = job.returnvalue;
    if (!result) {
      throw new NotFoundException('Video result not found');
    }

    return {
      videoId,
      jobId: job.id,
      status: 'completed',
      progress: 100,

      files: {
        video: `/api/videos/${videoId}/video`,
      },

      subtitleCount: result.subtitleCount,
    };
  }

  getVideoFile(videoId: string) {
    const videoPath = this.storageService.getVideoPath(videoId);

    if (!existsSync(videoPath)) {
      throw new NotFoundException('Translated video not found');
    }

    return videoPath;
  }
}
