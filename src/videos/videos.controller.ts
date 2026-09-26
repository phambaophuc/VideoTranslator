import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createReadStream } from 'fs';

import { VideosService } from './videos.service';

@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('video', {
      dest: './storage/uploads',
    }),
  )
  async uploadVideo(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Video file is required');
    }

    return this.videosService.create(file);
  }

  @Get(':videoId')
  async getVideo(@Param('videoId') videoId: string) {
    return this.videosService.getVideo(videoId);
  }

  @Get(':videoId/status')
  async getStatus(@Param('videoId') videoId: string) {
    return this.videosService.getStatus(videoId);
  }

  @Get(':videoId/video')
  getVideoFile(@Param('videoId') videoId: string): StreamableFile {
    const videoPath = this.videosService.getVideoFile(videoId);
    const stream = createReadStream(videoPath);

    return new StreamableFile(stream, {
      type: 'video/mp4',
      disposition: 'inline',
    });
  }
}
