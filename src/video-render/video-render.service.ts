import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

@Injectable()
export class VideoRenderService {
  async burnSubtitle(videoPath: string, subtitlePath: string, outputPath: string): Promise<string> {
    try {
      const subtitleFilter = `subtitles='${this.escapeSubtitlePath(subtitlePath)}'`;

      await execFileAsync(
        'ffmpeg',
        [
          '-y',

          '-i',
          videoPath,

          '-vf',
          subtitleFilter,

          '-c:v',
          'libx264',

          '-preset',
          'veryfast',

          '-crf',
          '23',

          '-threads',
          '2',

          '-c:a',
          'copy',

          outputPath,
        ],
        {
          windowsHide: true,
        },
      );

      return outputPath;
    } catch (error) {
      console.error('Video rendering error:', error);
      throw new InternalServerErrorException('Failed to burn subtitles into video');
    }
  }

  private escapeSubtitlePath(filePath: string): string {
    return filePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
  }
}
