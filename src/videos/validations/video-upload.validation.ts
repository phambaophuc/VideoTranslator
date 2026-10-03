import { BadRequestException } from '@nestjs/common';
import { extname } from 'path';

const ALLOWED_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm']);

const ALLOWED_MIME_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-matroska',
  'video/webm',
]);

export function validateVideoFile(file: Express.Multer.File): void {
  if (!file) {
    throw new BadRequestException('Video file is required');
  }

  const extension = extname(file.originalname).toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new BadRequestException(
      `Unsupported video format. Allowed formats: ${[...ALLOWED_EXTENSIONS].join(', ')}`,
    );
  }

  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    throw new BadRequestException(`Unsupported video MIME type: ${file.mimetype}`);
  }

  const maxSizeMb = Number(process.env.MAX_VIDEO_SIZE_MB ?? 500);
  const maxSizeBytes = maxSizeMb * 1024 * 1024;

  if (file.size > maxSizeBytes) {
    throw new BadRequestException(`Video file is too large. Maximum size is ${maxSizeMb} MB.`);
  }
}
