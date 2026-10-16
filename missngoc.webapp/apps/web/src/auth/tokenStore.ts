export const APP_TOKEN_KEY = 'missngoc.web.token';

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(APP_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAccessToken(token: string | null) {
  try {
    if (token) localStorage.setItem(APP_TOKEN_KEY, token);
    else localStorage.removeItem(APP_TOKEN_KEY);
  } catch {
    // trình duyệt chặn localStorage (chế độ riêng tư): chỉ giữ trong Redux
  }
}
