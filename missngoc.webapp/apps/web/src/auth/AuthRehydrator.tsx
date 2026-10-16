import { Button, Result, Spin } from 'antd';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { get, isNetworkError } from '../api/client';
import { initialized, loggedOut, profileLoaded, selectToken, useAppDispatch, useAppSelector, type AuthProfile } from '../store';

/** Mở lại app: còn token trong localStorage thì nạp lại hồ sơ vào Redux, không phải đăng nhập lại */
export function AuthRehydrator({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const token = useAppSelector(selectToken);
  const isInitialized = useAppSelector((s) => s.app.isInitialized);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      dispatch(initialized());
      return;
    }
    setOffline(false);
    try {
      const me = await get<AuthProfile>('/auth/me');
      dispatch(profileLoaded(me));
      dispatch(initialized());
    } catch (err) {
      if (isNetworkError(err)) setOffline(true);
      else dispatch(loggedOut());
    }
    // chỉ chạy khi mở app
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (offline) {
    return (
      <Result
        status="warning"
        title="Không kết nối được máy chủ"
        subTitle="Kiểm tra điện thoại có đang dùng Wi-Fi của trung tâm không, rồi thử lại."
        extra={
          <Button type="primary" onClick={() => void load()}>
            Thử lại
          </Button>
        }
      />
    );
  }
  if (!isInitialized) {
    return (
      <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }
  return <>{children}</>;
}
