import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { execFile } from 'child_process';
import { relative } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

@Injectable()
export class VideoRenderService {
  async burnSubtitle(videoPath: string, subtitlePath: string, outputPath: string): Promise<string> {
    try {
      const relativeSubtitlePath = relative(process.cwd(), subtitlePath);
      const subtitleFilter = `subtitles='${this.escapeSubtitlePath(relativeSubtitlePath)}'`;

      console.log('Subtitle filter:', subtitleFilter);

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
          'medium',

          '-crf',
          '23',

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
