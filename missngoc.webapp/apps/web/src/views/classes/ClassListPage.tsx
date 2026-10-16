import { PlusOutlined } from '@ant-design/icons';
import { Button, Card, Flex, Input, Segmented, Table, Tag } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PMS, RoutePaths } from '@missngoc/core';
import { useClasses } from '../../api/queries';
import type { ClassRow } from '../../api/types';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useCan } from '../../store';
import { ClassFormModal } from './ClassFormModal';

export function ClassListPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const canEdit = useCan(PMS.CLS_AD);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'ARCHIVED'>('ACTIVE');
  const [formOpen, setFormOpen] = useState(false);
  const classes = useClasses({ page, pageSize: 20, keyword: keyword || undefined, status });

  return (
    <div>
      <Flex justify="space-between" align="center" wrap gap={8} style={{ marginBottom: 16 }}>
        <h1 className="page-title">Lớp học</h1>
        {canEdit && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
            Tạo lớp
          </Button>
        )}
      </Flex>
      <Flex gap={8} wrap style={{ marginBottom: 12 }}>
        <Input.Search
          allowClear
          placeholder="Tìm tên lớp"
          style={{ maxWidth: 320 }}
          onSearch={(v) => {
            setKeyword(v);
            setPage(1);
          }}
        />
        <Segmented
          value={status}
          onChange={(v) => {
            setStatus(v as 'ACTIVE' | 'ARCHIVED');
            setPage(1);
          }}
          options={[
            { label: 'Đang học', value: 'ACTIVE' },
            { label: 'Đã lưu trữ', value: 'ARCHIVED' },
          ]}
        />
      </Flex>
      <Card styles={{ body: { padding: 0 } }}>
        <Table<ClassRow>
          rowKey="id"
          loading={classes.isLoading}
          dataSource={classes.data?.items}
          onRow={(r) => ({ onClick: () => navigate(RoutePaths.classDetail(r.id)), style: { cursor: 'pointer' } })}
          pagination={{ current: page, pageSize: 20, total: classes.data?.total, onChange: setPage, hideOnSinglePage: true }}
          scroll={{ x: true }}
          columns={[
            { title: 'Lớp', dataIndex: 'name', render: (v: string, r) => (<><b>{v}</b>{r.level ? <Tag style={{ marginLeft: 8 }}>{r.level}</Tag> : null}</>) },
            ...(isMobile
              ? []
              : [
                  { title: 'Giáo viên', key: 'teacher', render: (_: unknown, r: ClassRow) => r.teacher?.fullName ?? <span className="muted">Chưa gán</span> },
                  { title: 'Bài kiểm tra', dataIndex: 'examCount', width: 110 },
                ]),
            { title: 'Học sinh', dataIndex: 'studentCount', width: 90 },
          ]}
        />
      </Card>
      <ClassFormModal open={formOpen} value={null} onClose={() => setFormOpen(false)} onSaved={(c) => { void classes.refetch(); navigate(RoutePaths.classDetail(c.id)); }} />
    </div>
  );
}
