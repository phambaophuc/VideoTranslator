import { Module } from '@nestjs/common';
import { VideoRenderService } from './video-render.service';

@Module({
  providers: [VideoRenderService],
  exports: [VideoRenderService],
})
export class VideoRenderModule {}
