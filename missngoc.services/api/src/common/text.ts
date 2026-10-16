/** Bỏ dấu tiếng Việt, chữ thường, gộp khoảng trắng: dùng để so khớp tên cột, họ tên. */
export function foldVietnamese(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Danh sách học sinh Việt Nam xếp theo tên (chữ cuối), rồi đến họ và tên đệm. */
export function compareVietnameseNames(a: string, b: string): number {
  const key = (name: string) => {
    const parts = normalizeSpaces(name).split(' ');
    const given = parts.pop() ?? '';
    return [given, parts.join(' ')];
  };
  const [ga, ra] = key(a);
  const [gb, rb] = key(b);
  return ga.localeCompare(gb, 'vi') || ra.localeCompare(rb, 'vi');
}

/** Tên AI đọc trên bài có khớp học sinh không: tên (chữ cuối) phải xuất hiện trong tên đọc được. */
export function namesLikelyMatch(readName: string | null, studentName: string): boolean {
  if (!readName) return true;
  const readTokens = foldVietnamese(readName).split(' ');
  const given = foldVietnamese(studentName).split(' ').pop() ?? '';
  return readTokens.includes(given);
}
