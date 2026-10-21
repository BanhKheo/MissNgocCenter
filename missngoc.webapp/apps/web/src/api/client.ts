import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import { store, loggedOut } from '../store';

export const http = axios.create({ baseURL: '/api/v1', timeout: 60_000 });

http.interceptors.request.use((config) => {
  const token = store.getState().app.accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(
  (res) => res,
  (error: AxiosError<{ message?: string | string[]; code?: string }>) => {
    const status = error.response?.status;
    const isLogin = error.config?.url?.includes('/auth/login');
    // Token hết hạn, bị khoá: xoá phiên, về màn hình đăng nhập (FR-AUTH-03)
    if (status === 401 && !isLogin) store.dispatch(loggedOut());
    if (status === 403 && error.response?.data?.code === 'PASSWORD_CHANGE_REQUIRED') {
      if (!location.pathname.startsWith('/change-password')) location.assign('/change-password');
    }
    return Promise.reject(error);
  },
);

interface Envelope<T> {
  status: number;
  data: T;
}

/** Response JSON được bọc { status, data, timestamp, path }: lấy data ra */
export async function get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const res = await http.get<Envelope<T>>(url, config);
  return res.data.data;
}

export async function post<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const res = await http.post<Envelope<T>>(url, body, config);
  return res.data?.data as T;
}

export async function put<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const res = await http.put<Envelope<T>>(url, body, config);
  return res.data?.data as T;
}

export async function patch<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const res = await http.patch<Envelope<T>>(url, body, config);
  return res.data?.data as T;
}

export async function del(url: string): Promise<void> {
  await http.delete(url);
}

export async function upload<T>(url: string, file: Blob, fileName: string, onProgress?: (pct: number) => void): Promise<T> {
  const form = new FormData();
  form.append('file', file, fileName);
  const res = await http.post<Envelope<T>>(url, form, {
    timeout: 120_000,
    onUploadProgress: (e) => onProgress?.(e.total ? Math.round((e.loaded / e.total) * 100) : 0),
  });
  return res.data.data;
}

/** Tải file (Excel, ảnh) kèm token */
export async function downloadBlob(url: string, config?: Pick<AxiosRequestConfig, 'params'>): Promise<{ blob: Blob; fileName: string | null }> {
  const res = await http.get<Blob>(url, { ...config, responseType: 'blob', timeout: 120_000 });
  const cd = String(res.headers['content-disposition'] ?? '');
  const star = cd.match(/filename\*=UTF-8''([^;]+)/i);
  const plain = cd.match(/filename="([^"]+)"/i);
  const fileName = star ? decodeURIComponent(star[1]) : plain ? plain[1] : null;
  return { blob: res.data, fileName };
}

export function saveBlob(blob: Blob, fileName: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** Lấy câu báo lỗi tiếng Việt từ API */
export function errorMessage(err: unknown, fallback = 'Có lỗi xảy ra, thử lại sau'): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) return 'Không kết nối được máy chủ. Kiểm tra Wi-Fi rồi thử lại';
    const data = err.response.data as { message?: string | string[] } | undefined;
    const msg = data?.message;
    if (Array.isArray(msg)) return msg.join('. ');
    if (typeof msg === 'string' && msg) return msg;
  }
  return fallback;
}

export function isNetworkError(err: unknown): boolean {
  return axios.isAxiosError(err) && !err.response;
}
