import imageCompression from 'browser-image-compression';

export interface PreparedImage {
  blob: Blob;
  previewUrl: string;
  warnings: string[];
}

/**
 * Nén ảnh trên điện thoại trước khi tải (FR-CAP-06): tự xoay theo EXIF, cạnh dài khoảng 2.400 px,
 * còn khoảng 300–600 KB, luôn ra JPEG (kể cả ảnh HEIC của iPhone).
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const blob = await imageCompression(file, {
    maxWidthOrHeight: 2400,
    maxSizeMB: 0.6,
    initialQuality: 0.85,
    fileType: 'image/jpeg',
    useWebWorker: true,
  });
  const warnings = await checkQuality(blob).catch(() => []);
  return { blob, previewUrl: URL.createObjectURL(blob), warnings };
}

/** Cảnh báo ảnh quá tối hoặc có thể bị mờ: đo độ sáng trung bình và độ nét (phương sai Laplacian) */
async function checkQuality(blob: Blob): Promise<string[]> {
  const bitmap = await createImageBitmap(blob);
  const width = 400;
  const height = Math.max(1, Math.round((bitmap.height / bitmap.width) * width));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, width, height);

  const gray = new Float32Array(width * height);
  let sum = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    gray[p] = g;
    sum += g;
  }
  const mean = sum / gray.length;

  let lapSum = 0;
  let lapSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = gray[i - width] + gray[i + width] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
      lapSum += lap;
      lapSq += lap * lap;
      n++;
    }
  }
  const variance = lapSq / n - (lapSum / n) ** 2;

  const warnings: string[] = [];
  if (mean < 80) warnings.push('Ảnh hơi tối. Bật thêm đèn hoặc ra chỗ sáng hơn rồi chụp lại.');
  if (variance < 40) warnings.push('Ảnh có thể bị mờ. Giữ chắc tay, chạm vào phiếu trên màn hình để lấy nét rồi chụp lại.');
  return warnings;
}
