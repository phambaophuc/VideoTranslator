import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

import { MediaService } from '../media/media.service';
import { StorageService } from '../storage/storage.service';
import { SubtitleService } from '../subtitle/subtitle.service';
import { TranslationService } from '../translation/translation.service';
import { VideoRenderService } from '../video-render/video-render.service';
import { VideoProgressService } from '../videos/video-progress.service';
import { TranscriptionService } from './transcription.service';

@Processor('transcription', { concurrency: 1 })
export class TranscriptionProcessor extends WorkerHost {
  constructor(
    private readonly mediaService: MediaService,
    private readonly transcriptionService: TranscriptionService,
    private readonly subtitleService: SubtitleService,
    private readonly translationService: TranslationService,
    private readonly videoRenderService: VideoRenderService,
    private readonly videoProgressService: VideoProgressService,
    private readonly storageService: StorageService,
  ) {
    super();
  }

  async process(job: Job) {
    if (job.name !== 'transcribe-video') {
      return;
    }

    const { videoId, filePath } = job.data;

    const audioPath = this.storageService.getAudioPath(videoId);
    const transcriptPath = this.storageService.getTranscriptPath(videoId);
    const vietnameseSubtitlePath = this.storageService.getVietnameseSubtitlePath(videoId);
    const translatedVideoPath = this.storageService.getVideoPath(videoId);

    try {
      console.log(`[${videoId}] Starting video processing`);

      const extractingProgress = {
        progress: 10,
        step: 'extracting' as const,
        message: 'Extracting audio...',
      };
      await job.updateProgress(extractingProgress);
      this.videoProgressService.publish(videoId, extractingProgress);
      await this.mediaService.extractAudio(filePath, audioPath);

      const transcribingProgress = {
        progress: 30,
        step: 'transcribing' as const,
        message: 'Transcribing audio...',
      };
      await job.updateProgress(transcribingProgress);
      this.videoProgressService.publish(videoId, transcribingProgress);

      const { path: speechAudioPath, offset } =
        await this.mediaService.trimLeadingSilence(audioPath);
      const transcript = await this.transcriptionService.transcribe(speechAudioPath, offset);
      const preparingSubtitlesProgress = {
        progress: 50,
        step: 'preparing_subtitles' as const,
        message: 'Preparing subtitles...',
      };
      await job.updateProgress(preparingSubtitlesProgress);
      this.videoProgressService.publish(videoId, preparingSubtitlesProgress);
      await writeFile(transcriptPath, JSON.stringify(transcript, null, 2), 'utf8');

      const translationUnits = this.subtitleService.createTranslationUnits(transcript.segments);
      const translatingProgress = {
        progress: 70,
        step: 'translating' as const,
        message: 'Translating subtitles...',
      };
      await job.updateProgress(translatingProgress);
      this.videoProgressService.publish(videoId, translatingProgress);
      const translatedUnits = await this.translationService.translateBatch(translationUnits);

      const translatedSubtitles = this.subtitleService.finalizeTranslatedSegments(
        translationUnits,
        translatedUnits,
      );
      const vietnameseSrt = this.subtitleService.generateSrt(translatedSubtitles);
      await writeFile(vietnameseSubtitlePath, vietnameseSrt, 'utf8');

      const renderingProgress = {
        progress: 85,
        step: 'rendering' as const,
        message: 'Rendering translated video...',
      };
      await job.updateProgress(renderingProgress);
      this.videoProgressService.publish(videoId, renderingProgress);

      const outputDir = join(process.cwd(), 'storage/videos');
      await mkdir(outputDir, {
        recursive: true,
      });

      await this.videoRenderService.burnSubtitle(
        filePath,
        vietnameseSubtitlePath,
        translatedVideoPath,
      );
      await this.storageService.cleanupTemporaryFiles([
        filePath,
        audioPath,
        transcriptPath,
        vietnameseSubtitlePath,
      ]);

      const completedProgress = {
        progress: 100,
        step: 'completed' as const,
        message: 'Video translation completed.',
      };
      await job.updateProgress(completedProgress);
      this.videoProgressService.publish(videoId, completedProgress);
      this.videoProgressService.complete(videoId);

      console.log(`[${videoId}] Completed!`);

      return {
        videoId,
        transcriptPath,
        vietnameseSubtitlePath,
        translatedVideoPath,
        subtitleCount: translatedSubtitles.length,
        status: 'completed',
      };
    } catch (error) {
      await this.storageService.cleanupTemporaryFiles([
        filePath,
        audioPath,
        transcriptPath,
        vietnameseSubtitlePath,
      ]);

      const failedProgress = {
        progress: 0,
        step: 'failed' as const,
        message: 'Video processing failed.',
      };

      this.videoProgressService.publish(videoId, failedProgress);
      this.videoProgressService.complete(videoId);

      throw error;
    }
  }
}
