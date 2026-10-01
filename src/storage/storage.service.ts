import { Injectable, OnModuleInit } from '@nestjs/common';
import { existsSync } from 'fs';
import { mkdir, unlink } from 'fs/promises';
import { join } from 'path';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly storageDir = join(process.cwd(), 'storage');
  private readonly tempDir = join(this.storageDir, 'temp');
  private readonly uploadsDir = join(this.tempDir, 'uploads');
  private readonly audioDir = join(this.tempDir, 'audio');
  private readonly transcriptsDir = join(this.tempDir, 'transcripts');
  private readonly subtitlesDir = join(this.tempDir, 'subtitles');
  private readonly videosDir = join(this.storageDir, 'videos');

  async onModuleInit() {
    await this.initialize();
  }

  async initialize(): Promise<void> {
    await Promise.all([
      mkdir(this.uploadsDir, {
        recursive: true,
      }),

      mkdir(this.audioDir, {
        recursive: true,
      }),

      mkdir(this.transcriptsDir, {
        recursive: true,
      }),

      mkdir(this.subtitlesDir, {
        recursive: true,
      }),

      mkdir(this.videosDir, {
        recursive: true,
      }),
    ]);
  }

  getUploadPath(videoId: string, extension: string): string {
    return join(this.uploadsDir, `${videoId}${extension}`);
  }

  getAudioPath(videoId: string): string {
    return join(this.audioDir, `${videoId}.wav`);
  }

  getTranscriptPath(videoId: string): string {
    return join(this.transcriptsDir, `${videoId}.json`);
  }

  getVietnameseSubtitlePath(videoId: string): string {
    return join(this.subtitlesDir, `${videoId}.vi.srt`);
  }

  getVideoPath(videoId: string): string {
    return join(this.videosDir, `${videoId}.vi.mp4`);
  }

  async cleanupTemporaryFiles(paths: string[]): Promise<void> {
    for (const filePath of paths) {
      await this.deleteFile(filePath);
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    if (!existsSync(filePath)) {
      return;
    }

    try {
      await unlink(filePath);
    } catch (error) {
      console.error(`[Storage] Failed to delete: ${filePath}`, error);
    }
  }
}
