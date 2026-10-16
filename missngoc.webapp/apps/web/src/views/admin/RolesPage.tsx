import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Card, Checkbox, Flex, Form, Input, Modal, Popconfirm, Space, Table, Tag } from 'antd';
import { useEffect, useState } from 'react';
import { APP_PERMISSIONS } from '@missngoc/core';
import { del, errorMessage, post, put } from '../../api/client';
import { usePermissions, useRole, useRoles, useApiMutation } from '../../api/queries';
import type { PermissionGroup, RoleRow } from '../../api/types';

const PERM_LABEL = Object.fromEntries(APP_PERMISSIONS.map((p) => [p.code, p.displayName]));

/** Ma trận quyền: nhóm → quyền, tick để gán cho vai trò */
function PermissionMatrix({ groups, value, onChange, disabled }: { groups: PermissionGroup[]; value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  return (
    <Space orientation="vertical" style={{ width: '100%' }}>
      {groups.map((g) => (
        <Card key={g.id} size="small" title={g.name}>
          {g.permissions.map((p) => (
            <div key={p.id}>
              <Checkbox
                disabled={disabled}
                checked={value.includes(p.name)}
                onChange={(e) => onChange(e.target.checked ? [...value, p.name] : value.filter((x) => x !== p.name))}
              >
                <b>{p.name}</b> — {p.displayName}
              </Checkbox>
            </div>
          ))}
        </Card>
      ))}
    </Space>
  );
}

export function RolesPage() {
  const { message } = App.useApp();
  const roles = useRoles();
  const permissions = usePermissions();
  const [editId, setEditId] = useState<string | null>(null);
  const role = useRole(editId);
  const [selected, setSelected] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createPerms, setCreatePerms] = useState<string[]>([]);
  const [form] = Form.useForm();
  const refresh = useApiMutation(async () => undefined, [['roles']]);

  useEffect(() => {
    if (role.data) {
      setSelected(role.data.groups.flatMap((g) => g.permissions.filter((p) => p.isInRole).map((p) => p.name)));
      setDescription(role.data.description ?? '');
    }
  }, [role.data]);

  const save = async () => {
    if (!editId) return;
    try {
      await put(`/iam/roles/${editId}`, { description, permissions: selected });
      message.success('Đã lưu. Quyền mới có hiệu lực ngay');
      setEditId(null);
      refresh.mutate(undefined);
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const create = async () => {
    const v = await form.validateFields();
    try {
      await post('/iam/roles', { ...v, permissions: createPerms });
      message.success('Đã tạo vai trò');
      setCreateOpen(false);
      form.resetFields();
      setCreatePerms([]);
      refresh.mutate(undefined);
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const remove = async (r: RoleRow) => {
    try {
      await del(`/iam/roles/${r.id}`);
      message.success('Đã xoá vai trò');
      refresh.mutate(undefined);
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  return (
    <div>
      <Flex justify="space-between" align="center" wrap gap={8} style={{ marginBottom: 16 }}>
        <h1 className="page-title">Vai trò và quyền</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          Tạo vai trò
        </Button>
      </Flex>
      <p className="muted">
        Mỗi tài khoản có 1 vai trò. Một người cần quyền của 2 vai trò thì tạo vai trò mới gộp các quyền đó. Vai trò ADMIN luôn có mọi quyền.
      </p>
      <Card styles={{ body: { padding: 0 } }}>
        <Table<RoleRow>
          rowKey="id"
          loading={roles.isLoading}
          dataSource={roles.data}
          pagination={false}
          scroll={{ x: true }}
          columns={[
            { title: 'Vai trò', dataIndex: 'name', render: (v: string, r) => (<><b>{v}</b>{r.isSystem && <Tag style={{ marginLeft: 6 }}>Mặc định</Tag>}<div className="muted">{r.description}</div></>) },
            { title: 'Quyền', dataIndex: 'permissions', render: (ps: string[]) => ps.map((p) => <Tag key={p} title={PERM_LABEL[p]}>{p}</Tag>) },
            { title: 'Tài khoản', dataIndex: 'userCount', width: 90 },
            {
              title: '',
              key: 'actions',
              width: 150,
              render: (_, r) => (
                <Space>
                  <Button size="small" onClick={() => setEditId(r.id)}>
                    {r.name === 'ADMIN' ? 'Xem' : 'Sửa quyền'}
                  </Button>
                  {!r.isSystem && (
                    <Popconfirm title={`Xoá vai trò ${r.name}?`} okText="Xoá" cancelText="Huỷ" onConfirm={() => remove(r)}>
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  )}
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={!!editId}
        title={`Quyền của vai trò ${role.data?.name ?? ''}`}
        onCancel={() => setEditId(null)}
        onOk={save}
        okText="Lưu"
        cancelText="Đóng"
        okButtonProps={{ disabled: !role.data?.editable }}
        width={640}
        destroyOnHidden
      >
        {role.data && (
          <>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Mô tả" disabled={!role.data.editable} style={{ marginBottom: 12 }} />
            <PermissionMatrix groups={role.data.groups} value={selected} onChange={setSelected} disabled={!role.data.editable} />
          </>
        )}
      </Modal>

      <Modal open={createOpen} title="Tạo vai trò" onCancel={() => setCreateOpen(false)} onOk={create} okText="Tạo" cancelText="Huỷ" width={640} destroyOnHidden>
        <Form form={form} layout="vertical" requiredMark="optional">
          <Form.Item
            name="name"
            label="Tên vai trò"
            extra="Chữ in hoa, số, gạch dưới. Ví dụ: GIAOVU_GIAOVIEN"
            rules={[{ required: true, message: 'Nhập tên vai trò' }, { pattern: /^[A-Z][A-Z0-9_]{1,39}$/, message: 'Chữ in hoa, số, gạch dưới' }]}
            normalize={(v: string) => v?.toUpperCase().replace(/\s+/g, '_')}
          >
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Mô tả">
            <Input placeholder="Ví dụ: Giáo vụ kiêm giáo viên" />
          </Form.Item>
        </Form>
        <PermissionMatrix groups={permissions.data ?? []} value={createPerms} onChange={setCreatePerms} />
      </Modal>
    </div>
  );
}
