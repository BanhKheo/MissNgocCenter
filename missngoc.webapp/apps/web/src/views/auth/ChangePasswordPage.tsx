import { Alert, App, Button, Card, Form, Input, Typography } from 'antd';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { RoutePaths } from '@missngoc/core';
import { errorMessage, get, put } from '../../api/client';
import { loggedOut, profileLoaded, selectProfile, useAppDispatch, useAppSelector, type AuthProfile } from '../../store';

interface Values {
  currentPassword: string;
  newPassword: string;
  confirm: string;
}

export function ChangePasswordPage() {
  const profile = useAppSelector(selectProfile);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!profile) return <Navigate to={RoutePaths.login} replace />;

  const onFinish = async (v: Values) => {
    setLoading(true);
    setError(null);
    try {
      await put('/auth/me/password', { currentPassword: v.currentPassword, newPassword: v.newPassword });
      dispatch(profileLoaded(await get<AuthProfile>('/auth/me')));
      message.success('Đã đổi mật khẩu');
      navigate(RoutePaths.home, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <Card style={{ width: '100%', maxWidth: 420 }}>
        <Typography.Title level={4}>Đổi mật khẩu</Typography.Title>
        {profile.mustChangePassword && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            title="Bạn đang dùng mật khẩu tạm do Admin cấp. Hãy đặt mật khẩu mới trước khi bắt đầu."
          />
        )}
        {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}
        <Form layout="vertical" onFinish={onFinish} requiredMark={false} size="large">
          <Form.Item name="currentPassword" label="Mật khẩu hiện tại" rules={[{ required: true, message: 'Nhập mật khẩu hiện tại' }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="Mật khẩu mới"
            rules={[
              { required: true, message: 'Nhập mật khẩu mới' },
              { min: 8, message: 'Ít nhất 8 ký tự' },
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="Nhập lại mật khẩu mới"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: 'Nhập lại mật khẩu mới' },
              ({ getFieldValue }) => ({
                validator: (_, value) =>
                  !value || getFieldValue('newPassword') === value
                    ? Promise.resolve()
                    : Promise.reject(new Error('Hai mật khẩu chưa khớp')),
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            Lưu mật khẩu mới
          </Button>
        </Form>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
          {!profile.mustChangePassword ? (
            <Button type="link" onClick={() => navigate(-1)} style={{ padding: 0 }}>
              Quay lại
            </Button>
          ) : (
            <span />
          )}
          <Button type="link" style={{ padding: 0 }} onClick={() => dispatch(loggedOut())}>
            Đăng xuất
          </Button>
        </div>
      </Card>
    </div>
  );
}
