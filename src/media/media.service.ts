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

  async detectSpeechStart(audioPath: string, noiseDb = -35): Promise<number> {
    try {
      const { stderr } = await execFileAsync(
        'ffmpeg',
        [
          '-hide_banner',
          '-nostats',
          '-i',
          audioPath,
          '-af',
          `silencedetect=noise=${noiseDb}dB:d=0.3`,
          '-f',
          'null',
          '-',
        ],
        { maxBuffer: 10 * 1024 * 1024 },
      );

      const start = /silence_start:\s*(-?[\d.]+)/.exec(stderr);
      const end = /silence_end:\s*(-?[\d.]+)/.exec(stderr);

      if (!start || !end || Number(start[1]) > 0.1) return 0;
      return Math.max(0, Number(end[1]) - 0.15);
    } catch {
      return 0;
    }
  }

  async trimLeadingSilence(audioPath: string): Promise<{ path: string; offset: number }> {
    const offset = await this.detectSpeechStart(audioPath);
    if (offset < 0.5) return { path: audioPath, offset: 0 };

    const trimmedPath = audioPath.replace(/\.wav$/, '.trimmed.wav');
    await execFileAsync('ffmpeg', [
      '-y',
      '-ss',
      String(offset),
      '-i',
      audioPath,
      '-c',
      'copy',
      trimmedPath,
    ]);
    return { path: trimmedPath, offset };
  }
}
