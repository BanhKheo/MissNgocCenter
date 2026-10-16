import { Module } from '@nestjs/common';
import { GradingModule } from '../grading/grading.module';
import { SubmissionsController } from './controllers/submissions.controller';
import { ReviewService } from './services/review.service';
import { SubmissionsService } from './services/submissions.service';

@Module({
  imports: [GradingModule],
  controllers: [SubmissionsController],
  providers: [SubmissionsService, ReviewService],
  exports: [SubmissionsService],
})
export class SubmissionsModule {}
