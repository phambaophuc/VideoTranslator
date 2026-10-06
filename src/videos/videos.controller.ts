import 'multer';

import {
  Body,
  Controller,
  Get,
  HttpStatus,
  MessageEvent,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  Sse,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { createReadStream, statSync } from 'fs';
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
  getVideoFile(@Param('videoId') videoId: string, @Req() req: Request, @Res() res: Response) {
    const videoPath = this.videosService.getVideoFile(videoId);

    let fileSize: number;
    try {
      fileSize = statSync(videoPath).size;
    } catch {
      throw new NotFoundException('Video not found');
    }

    const range = req.headers.range;
    if (!range) {
      res.writeHead(HttpStatus.OK, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
      });
      createReadStream(videoPath).pipe(res);
      return;
    }

    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : fileSize - 1;

    if (isNaN(start) || start >= fileSize || end >= fileSize || start > end) {
      res.writeHead(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE, {
        'Content-Range': `bytes */${fileSize}`,
      });
      res.end();
      return;
    }

    const chunkSize = end - start + 1;

    res.writeHead(HttpStatus.PARTIAL_CONTENT, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'video/mp4',
    });

    const stream = createReadStream(videoPath, { start, end });
    stream.pipe(res);
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
