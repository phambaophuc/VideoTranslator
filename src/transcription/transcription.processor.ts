import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { join } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { MediaService } from '../media/media.service';
import { TranscriptionService } from './transcription.service';
import { SubtitleService } from '../subtitle/subtitle.service';
import { TranslationService } from '../translation/translation.service';

@Processor('transcription')
export class TranscriptionProcessor extends WorkerHost {
  constructor(
    private readonly mediaService: MediaService,
    private readonly transcriptionService: TranscriptionService,
    private readonly subtitleService: SubtitleService,
    private readonly translationService: TranslationService,
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
    const originalSubtitlePath = join(subtitleDir, `${videoId}.original.srt`);
    const vietnameseSubtitlePath = join(subtitleDir, `${videoId}.vi.srt`);

    // --------------------------------
    // 1. Extract audio
    // --------------------------------
    console.log(`[${videoId}] Extracting audio...`);
    await job.updateProgress(10);
    await this.mediaService.extractAudio(filePath, audioPath);

    // --------------------------------
    // 2. Whisper transcription
    // --------------------------------
    console.log(`[${videoId}] Transcribing...`);
    await job.updateProgress(30);
    const transcript = await this.transcriptionService.transcribe(audioPath);

    // --------------------------------
    // 3. Save raw transcript
    // --------------------------------
    await job.updateProgress(50);
    await writeFile(
      transcriptPath,
      JSON.stringify(transcript, null, 2),
      'utf8',
    );

    // --------------------------------
    // 4. Subtitle segmentation
    // --------------------------------
    console.log(`[${videoId}] Creating subtitles...`);
    const subtitles = this.subtitleService.createSubtitleSegments(
      transcript.segments,
    );

    // --------------------------------
    // 5. Original SRT
    // --------------------------------
    const originalSrt = this.subtitleService.generateSrt(subtitles);
    await writeFile(originalSubtitlePath, originalSrt, 'utf8');

    // --------------------------------
    // 6. Translate to Vietnamese
    // --------------------------------
    console.log(`[${videoId}] Translating to Vietnamese...`);
    await job.updateProgress(70);
    const translatedSubtitles =
      await this.translationService.translateBatch(subtitles);

    // --------------------------------
    // 7. Vietnamese SRT
    // --------------------------------
    const vietnameseSrt = this.subtitleService.generateSrt(translatedSubtitles);
    await writeFile(vietnameseSubtitlePath, vietnameseSrt, 'utf8');

    // --------------------------------
    // Done
    // --------------------------------
    await job.updateProgress(100);
    console.log(`[${videoId}] Video processing completed`);

    return {
      videoId,
      transcriptPath,
      originalSubtitlePath,
      vietnameseSubtitlePath,
      subtitleCount: subtitles.length,
      status: 'completed',
    };
  }
}
