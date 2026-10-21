import { Card, Flex, Input, Progress, Segmented, Select, Table, Tag } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PMS, RoutePaths } from '@missngoc/core';
import { useClassOptions, useExams } from '../../api/queries';
import type { ExamRow } from '../../api/types';
import { AddButton } from '../../components/buttons';
import { PageHeader } from '../../components/PageHeader';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useCan } from '../../store';
import { formatDate } from '../../utils/format';
import { ExamFormModal } from './ExamFormModal';

export function keyStatus(e: ExamRow) {
  if (e.gradingMode === 'MANUAL') return <Tag color="purple">Nhập điểm tay</Tag>;
  if (e.answerKeys.length === 0) return <Tag color="red">Chưa có đáp án</Tag>;
  if (e.answerKeys.some((k) => !k.complete)) return <Tag color="orange">Đáp án thiếu câu</Tag>;
  return <Tag color="green">{e.answerKeys.length > 1 ? `${e.answerKeys.length} mã đề` : 'Có đáp án'}</Tag>;
}

export function ExamListPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const canCreate = useCan(PMS.EXAM_AD);
  const classes = useClassOptions();
  const [page, setPage] = useState(1);
  const [classId, setClassId] = useState<string | undefined>();
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<'OPEN' | 'ARCHIVED'>('OPEN');
  const [formOpen, setFormOpen] = useState(false);
  const exams = useExams({ page, pageSize: 20, classId, keyword: keyword || undefined, status });

  return (
    <div>
      <PageHeader title="Bài kiểm tra" actions={<AddButton isRender={canCreate} text="Tạo bài kiểm tra" onClick={() => setFormOpen(true)} />} />
      <Flex gap={8} wrap style={{ marginBottom: 12 }}>
        <Select
          allowClear
          placeholder="Tất cả lớp"
          style={{ minWidth: 200 }}
          value={classId}
          onChange={(v) => {
            setClassId(v);
            setPage(1);
          }}
          showSearch={{ optionFilterProp: 'label' }}
          options={(classes.data ?? []).map((c) => ({ value: c.id, label: c.label }))}
        />
        <Input.Search allowClear placeholder="Tìm tên bài" style={{ maxWidth: 260 }} onSearch={(v) => { setKeyword(v); setPage(1); }} />
        <Segmented
          value={status}
          onChange={(v) => { setStatus(v as 'OPEN' | 'ARCHIVED'); setPage(1); }}
          options={[{ label: 'Đang mở', value: 'OPEN' }, { label: 'Đã lưu trữ', value: 'ARCHIVED' }]}
        />
      </Flex>
      <Card styles={{ body: { padding: 0 } }}>
        <Table<ExamRow>
          rowKey="id"
          loading={exams.isLoading}
          dataSource={exams.data?.items}
          onRow={(r) => ({ onClick: () => navigate(RoutePaths.examDetail(r.id)), style: { cursor: 'pointer' } })}
          pagination={{ current: page, pageSize: 20, total: exams.data?.total, onChange: setPage, hideOnSinglePage: true }}
          scroll={{ x: true }}
          columns={[
            { title: 'Ngày', dataIndex: 'examDate', width: 100, render: (v: string) => formatDate(v) },
            {
              title: 'Bài kiểm tra',
              dataIndex: 'title',
              render: (v: string, e) => (
                <>
                  <b>{v}</b>
                  <div className="muted">
                    {e.class.name} · {e.questionCount} câu
                  </div>
                </>
              ),
            },
            ...(isMobile ? [] : [{ title: 'Đáp án', key: 'keys', render: (_: unknown, e: ExamRow) => keyStatus(e) }]),
            {
              title: 'Tiến độ',
              key: 'progress',
              width: isMobile ? 110 : 220,
              render: (_, e) => {
                const done = e.counts.GRADED;
                const total = e.counts.total - e.counts.ABSENT;
                return (
                  <div>
                    <Progress percent={total ? Math.round((done / total) * 100) : 0} size="small" />
                    {e.counts.NEEDS_REVIEW > 0 && <Tag color="gold">{e.counts.NEEDS_REVIEW} cần duyệt</Tag>}
                  </div>
                );
              },
            },
          ]}
        />
      </Card>
      <ExamFormModal open={formOpen} value={null} defaultClassId={classId} onClose={() => setFormOpen(false)} onSaved={(e) => navigate(RoutePaths.examDetail(e.id))} />
    </div>
  );
}
