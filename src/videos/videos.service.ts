import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';

@Injectable()
export class VideosService {
  constructor(
    @InjectQueue('transcription')
    private readonly transcriptionQueue: Queue,
  ) {}

  async create(file: Express.Multer.File) {
    const videoId = randomUUID();

    const job = await this.transcriptionQueue.add('transcribe-video', {
      videoId,
      filePath: file.path,
      originalName: file.originalname,
    });

    return {
      videoId,
      jobId: job.id,
      status: 'queued',
    };
  }
}
