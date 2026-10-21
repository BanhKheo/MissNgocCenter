import { Module } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { GradebookController } from './gradebook.controller';
import { GradebookService } from './gradebook.service';

@Module({
  controllers: [GradebookController],
  providers: [GradebookService, CategoriesService],
})
export class GradebookModule {}
