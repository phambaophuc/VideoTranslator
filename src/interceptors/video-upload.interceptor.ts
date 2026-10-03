import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import multer from 'multer';
import { Observable } from 'rxjs';

@Injectable()
export class VideoUploadInterceptor implements NestInterceptor {
  private readonly upload: ReturnType<typeof multer>;

  constructor(private readonly configService: ConfigService) {
    const maxSizeMb = this.configService.get<number>('MAX_VIDEO_SIZE_MB', 500);

    this.upload = multer({
      dest: './storage/temp/uploads',

      limits: {
        fileSize: maxSizeMb * 1024 * 1024,
      },

      fileFilter: (req, file, callback) => {
        const extension = file.originalname.split('.').pop()?.toLowerCase();
        const allowedExtensions = ['mp4', 'mov', 'mkv', 'webm'];
        const allowedMimeTypes = ['video/mp4', 'video/quicktime', 'video/x-matroska', 'video/webm'];

        if (!extension || !allowedExtensions.includes(extension)) {
          return callback(new BadRequestException('Unsupported video format.'));
        }

        if (!allowedMimeTypes.includes(file.mimetype)) {
          return callback(new BadRequestException(`Unsupported video MIME type: ${file.mimetype}`));
        }

        callback(null, true);
      },
    });
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();

    return new Observable((subscriber) => {
      this.upload.single('video')(request, context.switchToHttp().getResponse(), (error) => {
        if (error) {
          subscriber.error(error);
          return;
        }

        next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (error) => subscriber.error(error),
          complete: () => subscriber.complete(),
        });
      });
    });
  }
}
