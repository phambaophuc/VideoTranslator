import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { MediaModule } from '../media/media.module';
import { SubtitleModule } from '../subtitle/subtitle.module';
import { TranslationModule } from '../translation/translation.module';
import { VideoRenderModule } from '../video-render/video-render.module';
import { VideosModule } from '../videos/videos.module';
import { TranscriptionProcessor } from './transcription.processor';
import { TranscriptionService } from './transcription.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'transcription',
    }),

    MediaModule,
    SubtitleModule,
    TranslationModule,
    VideoRenderModule,
    VideosModule,
  ],

  providers: [TranscriptionService, TranscriptionProcessor],
})
export class TranscriptionModule {}
