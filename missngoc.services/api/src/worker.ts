import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// Cùng code với api, chỉ không mở cổng HTTP. GradingProcessor tự nhận job khi APP_ROLE=worker.
async function bootstrap() {
  process.env.APP_ROLE = 'worker';
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
  Logger.log('Worker đã sẵn sàng', 'Worker');
}

void bootstrap();
