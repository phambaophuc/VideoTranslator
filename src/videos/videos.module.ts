import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { StorageModule } from '../storage/storage.module';
import { VideoJobStore } from './video-job.store';
import { VideoProgressService } from './video-progress.service';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'transcription',
    }),
    StorageModule,
  ],
  controllers: [VideosController],
  providers: [VideosService, VideoJobStore, VideoProgressService],
  exports: [VideoJobStore, VideoProgressService],
})
export class VideosModule {}
