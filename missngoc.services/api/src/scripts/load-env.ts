/** Script chạy ngoài Nest thì tự đọc .env (trong Docker biến môi trường đã có sẵn) */
export function loadEnv() {
  for (const file of ['.env', '../../.env']) {
    try {
      process.loadEnvFile(file);
      return;
    } catch {
      // không có file .env ở vị trí này
    }
  }
}
