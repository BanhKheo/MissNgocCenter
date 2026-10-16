import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { dirname, join, resolve, sep } from 'path';

/** Ảnh lưu ngoài thư mục web, tên file là UUID; chỉ trả qua endpoint có kiểm tra quyền. */
@Injectable()
export class StorageService {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(config.get<string>('UPLOAD_DIR', './data/uploads'));
  }

  async saveImage(examId: string, submissionId: string, data: Buffer): Promise<string> {
    const rel = [examId, submissionId, `${randomUUID()}.jpg`].join('/');
    const abs = this.absolute(rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, data);
    return rel;
  }

  read(rel: string): Promise<Buffer> {
    return readFile(this.absolute(rel));
  }

  stream(rel: string) {
    return createReadStream(this.absolute(rel));
  }

  async remove(rel: string): Promise<void> {
    await unlink(this.absolute(rel)).catch(() => undefined);
  }

  private absolute(rel: string): string {
    const abs = resolve(join(this.root, rel));
    if (!abs.startsWith(this.root + sep)) throw new BadRequestException('Đường dẫn file không hợp lệ');
    return abs;
  }
}
