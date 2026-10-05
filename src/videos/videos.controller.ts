import 'multer';

import {
  Body,
  Controller,
  Get,
  MessageEvent,
  Param,
  Post,
  Sse,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { createReadStream } from 'fs';
import { concat, map, Observable, of } from 'rxjs';

import { VideoUploadInterceptor } from '../interceptors/video-upload.interceptor';
import { validateVideoFile } from './validations/video-upload.validation';
import { VideoProgressService } from './video-progress.service';
import { VideosService } from './videos.service';

@Controller('videos')
export class VideosController {
  constructor(
    private readonly videosService: VideosService,
    private readonly videoProgressService: VideoProgressService,
  ) {}

  @Throttle({
    default: {
      limit: 5,
      ttl: 10 * 60 * 1000,
    },
  })
  @Post()
  @UseInterceptors(VideoUploadInterceptor)
  async uploadVideo(
    @UploadedFile() file: Express.Multer.File,
    @Body('language') targetLanguage?: string,
  ) {
    validateVideoFile(file);

    return this.videosService.create(file, targetLanguage);
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

  @SkipThrottle()
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
