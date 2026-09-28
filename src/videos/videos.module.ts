import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { VideoJobStore } from './video-job.store';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';
import { VideoProgressService } from './video-progress.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'transcription',
    }),
  ],
  controllers: [VideosController],
  providers: [VideosService, VideoJobStore, VideoProgressService],
  exports: [VideoJobStore, VideoProgressService],
})
export class VideosModule {}
