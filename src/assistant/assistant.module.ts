import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { AssistantProvider } from './assistant.provider';
import { AssistantBudget } from './assistant.budget';
@Module({
  imports: [AuthModule],
  controllers: [AssistantController],
  providers: [AssistantService, AssistantProvider, AssistantBudget, RateLimitGuard],
})
export class AssistantModule {}
