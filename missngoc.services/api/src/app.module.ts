import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AccessModule } from './common/access/access.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { ResponseInterceptor } from './common/response.interceptor';
import { StorageModule } from './common/storage/storage.module';
import { HealthController } from './health.controller';
import { ServerInfoController } from './server-info.controller';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClassesModule } from './modules/classes/classes.module';
import { ExamsModule } from './modules/exams/exams.module';
import { GradebookModule } from './modules/gradebook/gradebook.module';
import { GradingModule } from './modules/grading/grading.module';
import { IamModule } from './modules/iam/iam.module';
import { ImportsModule } from './modules/imports/imports.module';
import { ReportsModule } from './modules/reports/reports.module';
import { StudentsModule } from './modules/students/students.module';
import { SubmissionsModule } from './modules/submissions/submissions.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    QueueModule,
    StorageModule,
    AccessModule,
    AuditModule,
    AuthModule,
    IamModule,
    ImportsModule,
    ClassesModule,
    StudentsModule,
    ExamsModule,
    GradingModule,
    SubmissionsModule,
    ReportsModule,
    GradebookModule,
  ],
  controllers: [HealthController, ServerInfoController],
  providers: [
    // Thứ tự quan trọng: xác thực trước, kiểm quyền sau. Mặc định mọi endpoint đều chặn.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}
