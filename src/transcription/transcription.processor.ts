import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { join } from 'path';
import { mkdir, writeFile } from 'fs/promises';

import { MediaService } from '../media/media.service';
import { TranscriptionService } from './transcription.service';
import { SubtitleService } from '../subtitle/subtitle.service';

@Processor('transcription')
export class TranscriptionProcessor extends WorkerHost {
  constructor(
    private readonly mediaService: MediaService,
    private readonly transcriptionService: TranscriptionService,
    private readonly subtitleService: SubtitleService,
  ) {
    super();
  }

  async process(job: Job) {
    if (job.name !== 'transcribe-video') {
      return;
    }

    const { videoId, filePath } = job.data;

    console.log(`Starting transcription: ${videoId}`);

    const audioDir = join(process.cwd(), 'storage/audio');
    const transcriptDir = join(process.cwd(), 'storage/transcripts');
    const subtitleDir = join(process.cwd(), 'storage/subtitles');

    await mkdir(audioDir, {
      recursive: true,
    });

    await mkdir(transcriptDir, {
      recursive: true,
    });

    await mkdir(subtitleDir, {
      recursive: true,
    });

    const audioPath = join(audioDir, `${videoId}.wav`);
    const transcriptPath = join(transcriptDir, `${videoId}.json`);
    const subtitlePath = join(subtitleDir, `${videoId}.srt`);
    await job.updateProgress(10);

    // 1. Extract audio
    await this.mediaService.extractAudio(filePath, audioPath);
    await job.updateProgress(40);

    // 2. Whisper
    const transcript = await this.transcriptionService.transcribe(audioPath);

    const transcriptSegments = transcript.segments;

    const subtitleSegments =
      this.subtitleService.createSubtitleSegments(transcriptSegments);

    const srt = this.subtitleService.generateSrt(subtitleSegments);

    await job.updateProgress(80);

    // 3. Save transcript
    await writeFile(transcriptPath, JSON.stringify(transcript, null, 2));
    await writeFile(subtitlePath, srt, 'utf8');

    await job.updateProgress(100);

    console.log(`Transcription completed: ${videoId}`);

    return {
      videoId,
      transcriptPath,
      subtitlePath,
    };
  }
}
