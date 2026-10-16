import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common';
import type { Request, Response } from 'express';
import { map, Observable } from 'rxjs';

/** Bọc JSON thành { status, data, timestamp, path } như IUROADMAP. Bỏ qua file (Excel, ảnh) và 204. */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    return next.handle().pipe(
      map((data) => {
        if (data instanceof StreamableFile || res.headersSent || res.statusCode === 204) return data;
        return { status: res.statusCode, data: data ?? null, timestamp: new Date().toISOString(), path: req.originalUrl };
      }),
    );
  }
}
