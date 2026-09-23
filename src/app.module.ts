import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { VideosModule } from './videos/videos.module';
import { TranscriptionModule } from './transcription/transcription.module';
import { MediaModule } from './media/media.module';
import { SubtitleModule } from './subtitle/subtitle.module';
import { TranslationModule } from './translation/translation.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    }),

    VideosModule,
    TranscriptionModule,
    MediaModule,
    SubtitleModule,
    TranslationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
