import { StreamableFile } from '@nestjs/common';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** File tải về với tên tiếng Việt (RFC 5987) */
export function fileResponse(buffer: Buffer, fileName: string, mime = XLSX_MIME): StreamableFile {
  const ascii = fileName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\w.-]+/g, '_');
  return new StreamableFile(buffer, {
    type: mime,
    disposition: `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    length: buffer.length,
  });
}

export function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}
