import {
  AuditOutlined,
  BgColorsOutlined,
  BookOutlined,
  CameraOutlined,
  FileDoneOutlined,
  KeyOutlined,
  LogoutOutlined,
  MenuOutlined,
  SafetyOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar, Button, Drawer, Dropdown, Layout, Menu, type MenuProps } from 'antd';
import { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { hasAnyPermission, PMS, RoutePaths } from '@missngoc/core';
import { useIsMobile } from '../hooks/useIsMobile';
import { loggedOut, selectProfile, useAppDispatch, useAppSelector } from '../store';

const { Header, Sider, Content } = Layout;

type Item = { key: string; label: string; icon: React.ReactNode; perms: PMS[] };

const MAIN: Item[] = [
  { key: RoutePaths.capture, label: 'Chụp bài', icon: <CameraOutlined />, perms: [PMS.GRD_USER] },
  {
    key: RoutePaths.exams,
    label: 'Bài kiểm tra',
    icon: <FileDoneOutlined />,
    perms: [PMS.EXAM_AD, PMS.GRD_USER, PMS.RPT_AD, PMS.RPT_USER, PMS.CLS_AD, PMS.ATT_USER],
  },
  {
    key: RoutePaths.classes,
    label: 'Lớp học',
    icon: <TeamOutlined />,
    perms: [PMS.CLS_AD, PMS.ATT_USER, PMS.EXAM_AD, PMS.GRD_USER, PMS.RPT_AD, PMS.RPT_USER],
  },
];

const ADMIN: Item[] = [
  { key: RoutePaths.users, label: 'Tài khoản', icon: <UserOutlined />, perms: [PMS.USER_AD] },
  { key: RoutePaths.roles, label: 'Vai trò và quyền', icon: <SafetyOutlined />, perms: [PMS.USER_AD] },
  { key: RoutePaths.reportTemplate, label: 'Mẫu bảng điểm', icon: <BgColorsOutlined />, perms: [PMS.SYS_AD] },
  { key: RoutePaths.gradebookSettings, label: 'Sổ điểm và hệ số', icon: <BookOutlined />, perms: [PMS.SYS_AD] },
  { key: RoutePaths.auditLogs, label: 'Nhật ký thao tác', icon: <AuditOutlined />, perms: [PMS.SYS_AD] },
];

export function AppLayout() {
  const profile = useAppSelector(selectProfile)!;
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const items = useMemo<MenuProps['items']>(() => {
    const allowed = (list: Item[]) =>
      list
        .filter((i) => hasAnyPermission(profile.permissions, i.perms))
        .map((i) => ({ key: i.key, label: i.label, icon: i.icon }));
    const admin = allowed(ADMIN);
    return [
      ...allowed(MAIN),
      ...(admin.length ? [{ type: 'group' as const, label: 'Quản trị', children: admin }] : []),
    ];
  }, [profile.permissions]);

  const selected = [...MAIN, ...ADMIN].map((i) => i.key).find((k) => location.pathname.startsWith(k)) ?? '';

  const onMenu: MenuProps['onClick'] = ({ key }) => {
    navigate(key);
    setDrawerOpen(false);
  };

  const logout = () => {
    dispatch(loggedOut());
    queryClient.clear();
    navigate(RoutePaths.login, { replace: true });
  };

  const userMenu: MenuProps = {
    items: [
      { key: 'info', label: `${profile.fullName} · ${profile.role}`, disabled: true },
      { type: 'divider' },
      { key: 'password', icon: <KeyOutlined />, label: 'Đổi mật khẩu', onClick: () => navigate(RoutePaths.changePassword) },
      { key: 'logout', icon: <LogoutOutlined />, label: 'Đăng xuất', danger: true, onClick: logout },
    ],
  };

  const menu = <Menu mode="inline" selectedKeys={[selected]} items={items} onClick={onMenu} style={{ borderInlineEnd: 0 }} />;
  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobile && (
        <Sider width={220} theme="light" className="app-sider">
          <div className="brand brand-sider">MissNgoc Grader</div>
          {menu}
        </Sider>
      )}
      <Layout>
        <Header className="app-header" style={{ padding: isMobile ? '0 8px' : '0 20px' }}>
          {isMobile && <Button type="text" icon={<MenuOutlined />} onClick={() => setDrawerOpen(true)} aria-label="Mở menu" />}
          {isMobile && <span className="brand">MissNgoc Grader</span>}
          <div style={{ flex: 1 }} />
          <Dropdown menu={userMenu} trigger={['click']}>
            <Button type="text" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar size="small" className="app-avatar">
                {profile.fullName.split(' ').pop()?.charAt(0)}
              </Avatar>
              {!isMobile && profile.fullName}
            </Button>
          </Dropdown>
        </Header>
        <Content style={{ padding: isMobile ? 12 : 24 }}>
          <Outlet />
        </Content>
      </Layout>
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} placement="left" size={260} title="MissNgoc Grader">
        {menu}
      </Drawer>
    </Layout>
  );
}
