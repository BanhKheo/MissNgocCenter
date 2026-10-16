import { Module } from '@nestjs/common';
import { GradingModule } from '../grading/grading.module';
import { ExamsController } from './controllers/exams.controller';
import { AnswerKeysService } from './services/answer-keys.service';
import { ExamsService } from './services/exams.service';

@Module({
  imports: [GradingModule],
  controllers: [ExamsController],
  providers: [ExamsService, AnswerKeysService],
  exports: [ExamsService],
})
export class ExamsModule {}
