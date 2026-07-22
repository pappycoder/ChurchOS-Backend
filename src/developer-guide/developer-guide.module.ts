import { Module } from '@nestjs/common';
import { DeveloperGuideController } from './developer-guide.controller';

@Module({
  controllers: [DeveloperGuideController],
})
export class DeveloperGuideModule {}
