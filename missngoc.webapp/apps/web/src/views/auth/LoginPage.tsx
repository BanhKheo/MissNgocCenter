import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { RoutePaths } from '@missngoc/core';
import { errorMessage, post } from '../../api/client';
import type { LoginResponse } from '../../api/types';
import { loggedIn, selectProfile, useAppDispatch, useAppSelector } from '../../store';

// Chỉ có username và mật khẩu do Admin cấp. Không có đăng ký, không có email (FR-AUTH-01)
export function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const profile = useAppSelector(selectProfile);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (profile) return <Navigate to={profile.mustChangePassword ? RoutePaths.changePassword : RoutePaths.home} replace />;

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await post<LoginResponse>('/auth/login', values);
      dispatch(loggedIn({ accessToken: res.accessToken, profile: res.user }));
      const from = (location.state as { from?: string } | null)?.from;
      navigate(res.user.mustChangePassword ? RoutePaths.changePassword : (from ?? RoutePaths.home), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <Card style={{ width: '100%', maxWidth: 380 }}>
        <Typography.Title level={3} style={{ textAlign: 'center', color: '#1F4E78', marginBottom: 0 }}>
          MissNgoc Grader
        </Typography.Title>
        <p className="muted" style={{ textAlign: 'center', marginTop: 4 }}>
          Chấm bài trắc nghiệm
        </p>
        {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}
        <Form layout="vertical" onFinish={onFinish} requiredMark={false} size="large">
          <Form.Item name="username" label="Tên đăng nhập" rules={[{ required: true, message: 'Nhập tên đăng nhập' }]}>
            <Input prefix={<UserOutlined />} autoCapitalize="none" autoCorrect="off" autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, message: 'Nhập mật khẩu' }]}>
            <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            Đăng nhập
          </Button>
        </Form>
        <p className="muted" style={{ textAlign: 'center', marginTop: 16, marginBottom: 0 }}>
          Quên mật khẩu? Liên hệ Admin
        </p>
      </Card>
    </div>
  );
}
