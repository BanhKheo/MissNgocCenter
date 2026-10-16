import { Module } from '@nestjs/common';
import { GradingRunsController } from './controllers/grading-runs.controller';
import { GradingRunsService } from './services/grading-runs.service';
import { GradingProcessor } from './services/grading.processor';
import { ScoringService } from './services/scoring.service';

@Module({
  controllers: [GradingRunsController],
  providers: [ScoringService, GradingRunsService, GradingProcessor],
  exports: [ScoringService],
})
export class GradingModule {}
