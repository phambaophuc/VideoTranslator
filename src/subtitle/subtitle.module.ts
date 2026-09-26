import { Module } from '@nestjs/common';

import { SubtitleService } from './subtitle.service';

@Module({
  providers: [SubtitleService],
  exports: [SubtitleService],
})
export class SubtitleModule {}
