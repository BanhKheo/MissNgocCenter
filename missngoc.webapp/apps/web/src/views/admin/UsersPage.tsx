import { KeyOutlined, LockOutlined, UnlockOutlined } from '@ant-design/icons';
import { App, Button, Card, Flex, Form, Input, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { errorMessage, patch, post } from '../../api/client';
import { useApiMutation, useRoleOptions, useUsers } from '../../api/queries';
import type { UserRow } from '../../api/types';
import { AddButton, EditButton } from '../../components/buttons';
import { PageHeader } from '../../components/PageHeader';
import { selectProfile, useAppSelector } from '../../store';
import { copyText } from '../../utils/clipboard';
import { formatDateTime } from '../../utils/format';

/** Mật khẩu tạm dễ đọc: bỏ các ký tự dễ nhầm (0/O, 1/l/I) */
function randomPassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const arr = new Uint32Array(10);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join('');
}

/** Cấp tài khoản (FR-AUTH-06): username, họ tên, vai trò, mật khẩu tạm */
export function UsersPage() {
  const { message, modal } = App.useApp();
  const me = useAppSelector(selectProfile);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const users = useUsers({ page, pageSize: 20, keyword: keyword || undefined });
  const roles = useRoleOptions();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [resetFor, setResetFor] = useState<UserRow | null>(null);
  const [form] = Form.useForm();
  const [resetForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const refresh = useApiMutation(async () => undefined, [['users']]);

  const showPassword = (username: string, password: string) => {
    modal.success({
      title: 'Gửi thông tin đăng nhập cho người dùng',
      content: (
        <div>
          <p>
            Tên đăng nhập: <b>{username}</b>
            <br />
            Mật khẩu tạm: <Typography.Text code copyable>{password}</Typography.Text>
          </p>
          <p className="muted">Lần đầu đăng nhập, người dùng phải đổi mật khẩu này.</p>
        </div>
      ),
    });
  };

  const create = async () => {
    const v = await form.validateFields();
    try {
      await post('/iam/users', v);
      setCreateOpen(false);
      form.resetFields();
      refresh.mutate(undefined);
      showPassword(v.username.trim().toLowerCase(), v.password);
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const update = async (u: UserRow, body: Record<string, unknown>, done: string) => {
    try {
      await patch(`/iam/users/${u.id}`, body);
      message.success(done);
      refresh.mutate(undefined);
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const resetPassword = async () => {
    if (!resetFor) return;
    const v = await resetForm.validateFields();
    try {
      await post(`/iam/users/${resetFor.id}/password-reset`, { password: v.password });
      setResetFor(null);
      showPassword(resetFor.username, v.password);
      refresh.mutate(undefined);
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const roleSelect = <Select placeholder="Chọn vai trò" options={(roles.data ?? []).map((r) => ({ value: r.id, label: r.label }))} />;

  return (
    <div>
      <PageHeader
        title="Tài khoản"
        subtitle="Không có trang đăng ký. Trung tâm cấp tài khoản cho giáo vụ và giáo viên. Nhân viên nghỉ việc thì khoá, không xoá."
        actions={
          <AddButton
            text="Cấp tài khoản"
            onClick={() => {
              form.setFieldsValue({ password: randomPassword() });
              setCreateOpen(true);
            }}
          />
        }
      />
      <Input.Search allowClear placeholder="Tìm tên đăng nhập hoặc họ tên" style={{ maxWidth: 320, marginBottom: 12 }} onSearch={(v) => { setKeyword(v); setPage(1); }} />
      <Card styles={{ body: { padding: 0 } }}>
        <Table<UserRow>
          rowKey="id"
          loading={users.isLoading}
          dataSource={users.data?.items}
          pagination={{ current: page, pageSize: 20, total: users.data?.total, onChange: setPage, hideOnSinglePage: true }}
          scroll={{ x: true }}
          columns={[
            { title: 'Tên đăng nhập', dataIndex: 'username', render: (v: string, u) => (<><b>{v}</b>{u.id === me?.id && <Tag style={{ marginLeft: 6 }}>Bạn</Tag>}</>) },
            { title: 'Họ tên', dataIndex: 'fullName' },
            { title: 'Vai trò', key: 'role', render: (_, u) => <Tag color={u.role.name === 'ADMIN' ? 'blue' : undefined}>{u.role.name}</Tag> },
            {
              title: 'Trạng thái',
              key: 'status',
              render: (_, u) =>
                u.status === 'BANNED' ? <Tag color="red">Đã khoá</Tag> : u.mustChangePassword ? <Tag color="orange">Chưa đổi mật khẩu tạm</Tag> : <Tag color="green">Hoạt động</Tag>,
            },
            { title: 'Đăng nhập gần nhất', dataIndex: 'lastLoginAt', render: (v: string | null) => formatDateTime(v) || '—' },
            {
              title: '',
              key: 'actions',
              render: (_, u) => (
                <Space size={4} wrap>
                  <EditButton size="small" onClick={() => setEditing(u)} />
                  <Button size="small" icon={<KeyOutlined />} onClick={() => { resetForm.setFieldsValue({ password: randomPassword() }); setResetFor(u); }}>
                    Đặt lại mật khẩu
                  </Button>
                  {u.id !== me?.id &&
                    (u.status === 'ACTIVE' ? (
                      <Button size="small" danger icon={<LockOutlined />} onClick={() => modal.confirm({ title: `Khoá tài khoản ${u.username}?`, content: 'Người này bị đăng xuất ngay và không đăng nhập được nữa.', okText: 'Khoá', okButtonProps: { danger: true }, cancelText: 'Huỷ', onOk: () => update(u, { status: 'BANNED' }, 'Đã khoá tài khoản') })}>
                        Khoá
                      </Button>
                    ) : (
                      <Button size="small" icon={<UnlockOutlined />} onClick={() => update(u, { status: 'ACTIVE' }, 'Đã mở khoá')}>
                        Mở khoá
                      </Button>
                    ))}
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal open={createOpen} title="Cấp tài khoản" onCancel={() => setCreateOpen(false)} onOk={create} okText="Tạo" cancelText="Huỷ" destroyOnHidden>
        <Form form={form} layout="vertical" requiredMark="optional" preserve={false}>
          <Form.Item
            name="username"
            label="Tên đăng nhập"
            extra="Chữ thường, số, dấu chấm; 3–30 ký tự. Không cần email"
            rules={[{ required: true, message: 'Nhập tên đăng nhập' }, { pattern: /^[a-z0-9.]{3,30}$/, message: 'Chỉ chữ thường, số, dấu chấm; 3–30 ký tự' }]}
            normalize={(v: string) => v?.toLowerCase().replace(/\s/g, '')}
          >
            <Input placeholder="giaovu.lan" autoCapitalize="none" />
          </Form.Item>
          <Form.Item name="fullName" label="Họ tên" rules={[{ required: true, message: 'Nhập họ tên' }]}>
            <Input placeholder="Nguyễn Thị Lan" />
          </Form.Item>
          <Form.Item name="roleId" label="Vai trò" rules={[{ required: true, message: 'Chọn vai trò' }]}>
            {roleSelect}
          </Form.Item>
          <Form.Item label="Mật khẩu tạm" required>
            <Flex gap={8}>
              <Form.Item name="password" noStyle rules={[{ required: true, min: 8, message: 'Ít nhất 8 ký tự' }]}>
                <Input />
              </Form.Item>
              <Button onClick={() => form.setFieldsValue({ password: randomPassword() })}>Tạo ngẫu nhiên</Button>
            </Flex>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={!!editing}
        title={`Sửa tài khoản ${editing?.username ?? ''}`}
        onCancel={() => setEditing(null)}
        okText="Lưu"
        cancelText="Huỷ"
        destroyOnHidden
        onOk={async () => {
          if (!editing) return;
          const v = await editForm.validateFields();
          await update(editing, { fullName: v.fullName, roleId: v.roleId }, 'Đã lưu');
          setEditing(null);
        }}
      >
        <Form form={editForm} layout="vertical" key={editing?.id} initialValues={{ fullName: editing?.fullName, roleId: editing?.role.id }}>
          <Form.Item name="fullName" label="Họ tên" rules={[{ required: true, message: 'Nhập họ tên' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="roleId" label="Vai trò" extra="Đổi vai trò có hiệu lực ngay, không cần đăng nhập lại">
            {roleSelect}
          </Form.Item>
        </Form>
      </Modal>

      <Modal open={!!resetFor} title={`Đặt lại mật khẩu cho ${resetFor?.username ?? ''}`} onCancel={() => setResetFor(null)} onOk={resetPassword} okText="Đặt lại" cancelText="Huỷ" destroyOnHidden>
        <Form form={resetForm} layout="vertical">
          <Form.Item label="Mật khẩu tạm mới" required>
            <Flex gap={8}>
              <Form.Item name="password" noStyle rules={[{ required: true, min: 8, message: 'Ít nhất 8 ký tự' }]}>
                <Input />
              </Form.Item>
              <Button onClick={() => resetForm.setFieldsValue({ password: randomPassword() })}>Tạo ngẫu nhiên</Button>
              <Button onClick={() => void copyText(resetForm.getFieldValue('password')).then(() => message.success('Đã sao chép'))}>Sao chép</Button>
            </Flex>
          </Form.Item>
          <p className="muted">Người dùng phải đổi mật khẩu này ở lần đăng nhập sau.</p>
        </Form>
      </Modal>
    </div>
  );
}
