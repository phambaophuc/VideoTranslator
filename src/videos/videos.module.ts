import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { VideoJobStore } from './video-job.store';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'transcription',
    }),
  ],
  controllers: [VideosController],
  providers: [VideosService, VideoJobStore],
  exports: [VideoJobStore],
})
export class VideosModule {}
