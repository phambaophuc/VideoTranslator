import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';
import { VideoJobStore } from './video-job.store';

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
