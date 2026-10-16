import { Card, Input, Table, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useAuditLogs } from '../../api/queries';
import type { AuditLogRow } from '../../api/types';

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
  'student.import': 'Import học sinh',
  'student.transfer': 'Chuyển lớp',
  'student.leave-class': 'Rời lớp',
  'exam.create': 'Tạo bài kiểm tra',
  'exam.update': 'Sửa bài kiểm tra',
  'answer-key.save': 'Lưu đáp án',
  'answer-key.delete': 'Xoá đáp án',
  'grading.run': 'Generate',
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
      <h1 className="page-title" style={{ marginBottom: 16 }}>
        Nhật ký thao tác
      </h1>
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
              <Typography.Paragraph style={{ margin: 0 }}>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify({ trước: r.before, sau: r.after }, null, 2)}</pre>
              </Typography.Paragraph>
            ),
          }}
          columns={[
            { title: 'Lúc', dataIndex: 'at', width: 150, render: (v: string) => dayjs(v).format('DD/MM/YYYY HH:mm:ss') },
            { title: 'Người làm', key: 'actor', render: (_, r) => r.actor?.fullName ?? '—' },
            { title: 'Thao tác', dataIndex: 'action', render: (v: string) => ACTION_LABEL[v] ?? v },
            { title: 'Đối tượng', key: 'entity', render: (_, r) => `${r.entity}${r.entityId ? ` · ${r.entityId.slice(0, 8)}` : ''}` },
          ]}
        />
      </Card>
    </div>
  );
}
