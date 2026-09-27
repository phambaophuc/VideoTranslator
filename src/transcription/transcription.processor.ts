import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

import { MediaService } from '../media/media.service';
import { SubtitleService } from '../subtitle/subtitle.service';
import { TranslationService } from '../translation/translation.service';
import { VideoRenderService } from '../video-render/video-render.service';
import { TranscriptionService } from './transcription.service';

@Processor('transcription')
export class TranscriptionProcessor extends WorkerHost {
  constructor(
    private readonly mediaService: MediaService,
    private readonly transcriptionService: TranscriptionService,
    private readonly subtitleService: SubtitleService,
    private readonly translationService: TranslationService,
    private readonly videoRenderService: VideoRenderService,
  ) {
    super();
  }

  async process(job: Job) {
    if (job.name !== 'transcribe-video') {
      return;
    }

    const { videoId, filePath } = job.data;

    console.log(`[${videoId}] Starting video processing`);

    const audioDir = join(process.cwd(), 'storage/audio');
    const transcriptDir = join(process.cwd(), 'storage/transcripts');
    const subtitleDir = join(process.cwd(), 'storage/subtitles');

    await mkdir(audioDir, { recursive: true });
    await mkdir(transcriptDir, { recursive: true });
    await mkdir(subtitleDir, { recursive: true });

    const audioPath = join(audioDir, `${videoId}.wav`);
    const transcriptPath = join(transcriptDir, `${videoId}.json`);
    const vietnameseSubtitlePath = join(subtitleDir, `${videoId}.vi.srt`);

    await job.updateProgress({
      progress: 10,
      step: 'extracting',
      message: 'Extracting audio...',
    });
    await this.mediaService.extractAudio(filePath, audioPath);

    await job.updateProgress({
      progress: 30,
      step: 'transcribing',
      message: 'Transcribing audio...',
    });
    const transcript = await this.transcriptionService.transcribe(audioPath);

    await job.updateProgress({
      progress: 50,
      step: 'preparing_subtitles',
      message: 'Preparing subtitles...',
    });
    await writeFile(transcriptPath, JSON.stringify(transcript, null, 2), 'utf8');

    const translationUnits = this.subtitleService.createTranslationUnits(transcript.segments);

    await job.updateProgress({
      progress: 70,
      step: 'translating',
      message: 'Translating subtitles...',
    });
    const translatedUnits = await this.translationService.translateBatch(translationUnits);

    const translatedSubtitles = this.subtitleService.finalizeTranslatedSegments(
      translationUnits,
      translatedUnits,
    );

    const vietnameseSrt = this.subtitleService.generateSrt(translatedSubtitles);
    await writeFile(vietnameseSubtitlePath, vietnameseSrt, 'utf8');

    await job.updateProgress({
      progress: 85,
      step: 'rendering',
      message: 'Rendering translated video...',
    });

    const outputDir = join(process.cwd(), 'storage/videos');
    await mkdir(outputDir, {
      recursive: true,
    });

    const translatedVideoPath = join(outputDir, `${videoId}.vi.mp4`);
    await this.videoRenderService.burnSubtitle(
      filePath,
      vietnameseSubtitlePath,
      translatedVideoPath,
    );

    await job.updateProgress({
      progress: 100,
      step: 'completed',
      message: 'Video translation completed.',
    });
    console.log(`[${videoId}] Video processing completed`);

    return {
      videoId,
      transcriptPath,
      vietnameseSubtitlePath,
      translatedVideoPath,
      subtitleCount: translatedSubtitles.length,
      status: 'completed',
    };
  }
}
