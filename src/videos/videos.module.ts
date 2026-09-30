import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { VideoJobStore } from './video-job.store';
import { VideoProgressService } from './video-progress.service';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';

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
