import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Sse,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
  MessageEvent,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createReadStream } from 'fs';

import { VideosService } from './videos.service';
import { VideoProgressService } from './video-progress.service';
import { concat, map, Observable, of } from 'rxjs';

@Controller('videos')
export class VideosController {
  constructor(
    private readonly videosService: VideosService,
    private readonly videoProgressService: VideoProgressService,
  ) {}

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

  @Sse(':videoId/events')
  events(@Param('videoId') videoId: string): Observable<MessageEvent> {
    const latest = this.videoProgressService.getLatest(videoId);
    const stream = this.videoProgressService.getStream(videoId).pipe(
      map((event) => ({
        type: 'progress',
        data: event,
      })),
    );

    if (!latest) {
      return stream;
    }

    return concat(
      of({
        type: 'progress',
        data: latest,
      }),
      stream,
    );
  }
}
