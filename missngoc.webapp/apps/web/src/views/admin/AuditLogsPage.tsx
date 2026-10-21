import { Card, Input, Table } from 'antd';
import { useState } from 'react';
import { useAuditLogs } from '../../api/queries';
import type { AuditLogRow } from '../../api/types';
import { PageHeader } from '../../components/PageHeader';
import { formatDateTime } from '../../utils/format';

const ACTION_LABEL: Record<string, string> = {
  'user.create': 'Tạo tài khoản',
  'user.update': 'Sửa tài khoản',
  'user.reset-password': 'Đặt lại mật khẩu',
  'user.change-password': 'Đổi mật khẩu',
  'role.create': 'Tạo vai trò',
  'role.update': 'Sửa quyền vai trò',
  'role.delete': 'Xoá vai trò',
  'class.create': 'Tạo lớp',
  'class.update': 'Sửa lớp',
  'student.create': 'Thêm học sinh',
  'student.update': 'Sửa học sinh',
  'student.import': 'Nhập học sinh từ Excel',
  'student.transfer': 'Chuyển lớp',
  'student.leave-class': 'Rời lớp',
  'exam.create': 'Tạo bài kiểm tra',
  'exam.update': 'Sửa bài kiểm tra',
  'answer-key.save': 'Lưu đáp án',
  'answer-key.delete': 'Xoá đáp án',
  'grading.run': 'Chấm bài',
  'submission.answer.update': 'Sửa câu khi duyệt',
  'submission.confirm': 'Duyệt xong',
  'submission.version-code': 'Sửa mã đề',
  'submission.image.delete': 'Xoá ảnh',
  'submission.image.move': 'Chuyển ảnh',
  'report-template.update': 'Sửa mẫu bảng điểm',
};

/** Ai sửa gì, lúc nào (UC-16) */
export function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const logs = useAuditLogs({ page, pageSize: 50, keyword: keyword || undefined });

  return (
    <div>
      <PageHeader title="Nhật ký thao tác" />
      <Input.Search allowClear placeholder="Lọc theo thao tác, ví dụ answer-key" style={{ maxWidth: 320, marginBottom: 12 }} onSearch={(v) => { setKeyword(v); setPage(1); }} />
      <Card styles={{ body: { padding: 0 } }}>
        <Table<AuditLogRow>
          rowKey="id"
          size="small"
          loading={logs.isLoading}
          dataSource={logs.data?.items}
          pagination={{ current: page, pageSize: 50, total: logs.data?.total, onChange: setPage, hideOnSinglePage: true }}
          scroll={{ x: true }}
          expandable={{
            expandedRowRender: (r) => (
              <pre className="json-pre">{JSON.stringify({ trước: r.before, sau: r.after }, null, 2)}</pre>
            ),
          }}
          columns={[
            { title: 'Lúc', dataIndex: 'at', width: 160, render: (v: string) => formatDateTime(v, true) },
            { title: 'Người làm', key: 'actor', render: (_, r) => r.actor?.fullName ?? '—' },
            { title: 'Thao tác', dataIndex: 'action', render: (v: string) => ACTION_LABEL[v] ?? v },
            { title: 'Đối tượng', key: 'entity', render: (_, r) => `${r.entity}${r.entityId ? ` · ${r.entityId.slice(0, 8)}` : ''}` },
          ]}
        />
      </Card>
    </div>
  );
}
