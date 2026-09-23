import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'transcription',
    }),
  ],
  controllers: [VideosController],
  providers: [VideosService],
})
export class VideosModule {}
