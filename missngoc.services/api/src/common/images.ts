import sharp from 'sharp';

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
// Giữ ảnh đủ nét vì phiếu trắc nghiệm có nhiều ô nhỏ sát nhau
export const MAX_LONG_EDGE = 2576;

type DetectedType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic';

/** Nhận diện loại ảnh bằng magic bytes, không tin phần mở rộng hay mimetype trình duyệt gửi. */
export function detectImageType(buf: Buffer): DetectedType | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return 'image/heic';
  }
  return null;
}

export class ImageRejectedError extends Error {}

/**
 * Chuẩn hoá ảnh trước khi lưu và gửi AI: xoay theo EXIF, thu cạnh dài về tối đa 2.576 px, lưu JPEG.
 * Web đã nén trên điện thoại; bước này là lớp bảo vệ khi ảnh tải lên chưa qua nén.
 */
export async function normalizeImage(input: Buffer): Promise<{ data: Buffer; mimeType: 'image/jpeg'; width: number; height: number }> {
  const type = detectImageType(input);
  if (!type) throw new ImageRejectedError('File không phải ảnh JPEG, PNG hoặc WebP');
  if (type === 'image/heic') {
    throw new ImageRejectedError('Ảnh HEIC chưa hỗ trợ. Hãy chụp bằng nút "Chụp bài" trên web, ảnh sẽ tự chuyển sang JPEG');
  }
  try {
    const { data, info } = await sharp(input)
      .rotate()
      .resize({ width: MAX_LONG_EDGE, height: MAX_LONG_EDGE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { data, mimeType: 'image/jpeg', width: info.width, height: info.height };
  } catch {
    throw new ImageRejectedError('Ảnh bị hỏng, không đọc được');
  }
}
