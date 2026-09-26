import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

@Injectable()
export class MediaService {
  async extractAudio(videoPath: string, outputPath: string): Promise<string> {
    try {
      await execFileAsync('ffmpeg', [
        '-y',
        '-i',
        videoPath,

        '-vn',

        '-acodec',
        'pcm_s16le',

        '-ar',
        '16000',

        '-ac',
        '1',

        outputPath,
      ]);

      return outputPath;
    } catch (error) {
      console.error('FFmpeg error:', error);
      throw new InternalServerErrorException('Failed to extract audio from video');
    }
  }
}
