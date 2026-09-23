import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { TranscriptionService } from './transcription.service';
import { TranscriptionProcessor } from './transcription.processor';
import { MediaModule } from '../media/media.module';
import { SubtitleModule } from '../subtitle/subtitle.module';
import { TranslationModule } from '../translation/translation.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'transcription',
    }),

    MediaModule,
    SubtitleModule,
    TranslationModule,
  ],

  providers: [TranscriptionService, TranscriptionProcessor],
})
export class TranscriptionModule {}
