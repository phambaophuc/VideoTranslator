import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { join } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { MediaService } from '../media/media.service';
import { TranscriptionService } from './transcription.service';
import { SubtitleService } from '../subtitle/subtitle.service';
import { TranslationService } from '../translation/translation.service';
import { VideoRenderService } from '../video-render/video-render.service';

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

    console.log(`[${videoId}] Extracting audio...`);
    await job.updateProgress(10);
    await this.mediaService.extractAudio(filePath, audioPath);

    console.log(`[${videoId}] Transcribing...`);
    await job.updateProgress(30);
    const transcript = await this.transcriptionService.transcribe(audioPath);

    await job.updateProgress(50);
    await writeFile(
      transcriptPath,
      JSON.stringify(transcript, null, 2),
      'utf8',
    );

    console.log(`[${videoId}] Creating translation units...`);
    const translationUnits = this.subtitleService.createTranslationUnits(
      transcript.segments,
    );

    console.log(`[${videoId}] Translating to Vietnamese...`);
    await job.updateProgress(70);
    const translatedUnits =
      await this.translationService.translateBatch(translationUnits);

    const translatedSubtitles = this.subtitleService.finalizeTranslatedSegments(
      translationUnits,
      translatedUnits,
    );

    const vietnameseSrt = this.subtitleService.generateSrt(translatedSubtitles);
    await writeFile(vietnameseSubtitlePath, vietnameseSrt, 'utf8');

    console.log(`[${videoId}] Rendering translated video...`);
    await job.updateProgress(85);

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

    await job.updateProgress(100);
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
