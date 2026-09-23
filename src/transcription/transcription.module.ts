import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { TranscriptionService } from './transcription.service';
import { TranscriptionProcessor } from './transcription.processor';
import { MediaModule } from '../media/media.module';
import { SubtitleModule } from '../subtitle/subtitle.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'transcription',
    }),

    MediaModule,
    SubtitleModule,
  ],

  providers: [TranscriptionService, TranscriptionProcessor],
})
export class TranscriptionModule {}
