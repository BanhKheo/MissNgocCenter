import { BookOutlined, EditOutlined, SwapOutlined, UserDeleteOutlined } from '@ant-design/icons';
import { App, Button, Card, Descriptions, Flex, Modal, Select, Space, Table, Tabs, Tag } from 'antd';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PMS, RoutePaths } from '@missngoc/core';
import { del, errorMessage, patch, post } from '../../api/client';
import { qk, useApiMutation, useClass, useClassOptions, useExams, useStudents } from '../../api/queries';
import type { StudentRow } from '../../api/types';
import { AddButton, ArchiveButton, EditButton, ImportExcelButton, RowAction } from '../../components/buttons';
import { ImportModal } from '../../components/ImportModal';
import { PageHeader } from '../../components/PageHeader';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useCan } from '../../store';
import { formatDate, formatDateRange } from '../../utils/format';
import { ExamFormModal } from '../exams/ExamFormModal';
import { ClassFormModal } from './ClassFormModal';
import { StudentFormModal } from './StudentFormModal';

export function ClassDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const isMobile = useIsMobile();
  const canEdit = useCan(PMS.CLS_AD);
  const canExam = useCan(PMS.EXAM_AD);
  const cls = useClass(id);
  const students = useStudents(id);
  const exams = useExams({ page: 1, pageSize: 100, classId: id });
  const classOptions = useClassOptions();

  const [classForm, setClassForm] = useState(false);
  const [studentForm, setStudentForm] = useState<{ open: boolean; value: StudentRow | null }>({ open: false, value: null });
  const [importOpen, setImportOpen] = useState(false);
  const [examForm, setExamForm] = useState(false);
  const [transfer, setTransfer] = useState<{ student: StudentRow; to?: string } | null>(null);

  const refreshStudents = useApiMutation(async () => undefined, [qk.students(id), qk.class(id)]);

  const archive = async () => {
    try {
      await patch(`/classes/${id}`, { status: cls.data?.status === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED' });
      message.success('Đã cập nhật');
      void cls.refetch();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const removeStudent = async (s: StudentRow) => {
    try {
      await del(`/classes/${id}/students/${s.id}`);
      message.success(`${s.fullName} đã rời lớp. Lịch sử điểm vẫn được giữ`);
      refreshStudents.mutate(undefined);
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const doTransfer = async () => {
    if (!transfer?.to) return;
    try {
      await post(`/classes/${id}/students/${transfer.student.id}/transfer`, { toClassId: transfer.to });
      message.success('Đã chuyển lớp');
      setTransfer(null);
      refreshStudents.mutate(undefined);
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const c = cls.data;

  return (
    <div>
      <PageHeader
        back={{ label: 'Lớp học', to: RoutePaths.classes }}
        title={c?.name}
        tags={c?.status === 'ARCHIVED' && <Tag>Đã lưu trữ</Tag>}
        actions={
          c && (
            <>
              <Button type="primary" icon={<BookOutlined />} onClick={() => navigate(RoutePaths.classGradebook(id))}>
                Sổ điểm
              </Button>
              <EditButton isRender={canEdit} onClick={() => setClassForm(true)} />
              <ArchiveButton
                isRender={canEdit}
                archived={c.status === 'ARCHIVED'}
                confirmTitle={{ archive: 'Lưu trữ lớp? Lớp sẽ ẩn khỏi danh sách, điểm vẫn giữ.', restore: 'Mở lại lớp này?' }}
                onConfirm={archive}
              />
            </>
          )
        }
      />

      {c && (
        <Card size="small" style={{ marginBottom: 12 }}>
          <Descriptions size="small" column={isMobile ? 1 : 4}>
            <Descriptions.Item label="Trình độ">{c.level ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Giáo viên">{c.teacher?.fullName ?? 'Chưa gán'}</Descriptions.Item>
            <Descriptions.Item label="Học sinh">{c.studentCount}</Descriptions.Item>
            <Descriptions.Item label="Khoá học">
              {formatDateRange(c.startDate, c.endDate) || '—'}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      <Card>
        <Tabs
          items={[
            {
              key: 'students',
              label: `Học sinh (${students.data?.length ?? 0})`,
              children: (
                <>
                  {canEdit && (
                    <Flex gap={8} wrap style={{ marginBottom: 12 }}>
                      <AddButton text="Thêm học sinh" onClick={() => setStudentForm({ open: true, value: null })} />
                      <ImportExcelButton onClick={() => setImportOpen(true)} />
                    </Flex>
                  )}
                  <Table<StudentRow>
                    rowKey="id"
                    size="small"
                    loading={students.isLoading}
                    dataSource={students.data}
                    pagination={false}
                    scroll={{ x: true }}
                    columns={[
                      { title: 'STT', key: 'stt', width: 50, render: (_, __, i) => i + 1 },
                      { title: 'Mã HS', dataIndex: 'studentCode', width: 100 },
                      { title: 'Họ và tên', dataIndex: 'fullName' },
                      ...(isMobile
                        ? []
                        : [
                            { title: 'Ngày sinh', dataIndex: 'dob', render: (v: string | null) => formatDate(v) },
                            { title: 'SĐT phụ huynh', dataIndex: 'parentPhone' },
                          ]),
                      ...(canEdit
                        ? [
                            {
                              title: '',
                              key: 'actions',
                              width: 120,
                              render: (_: unknown, s: StudentRow) => (
                                <Space size={0}>
                                  <RowAction icon={<EditOutlined />} label="Sửa" onClick={() => setStudentForm({ open: true, value: s })} />
                                  <RowAction icon={<SwapOutlined />} label="Chuyển lớp" onClick={() => setTransfer({ student: s })} />
                                  <RowAction
                                    icon={<UserDeleteOutlined />}
                                    label="Rời lớp"
                                    danger
                                    confirm={{ title: `Cho ${s.fullName} rời lớp?`, description: 'Lịch sử điểm vẫn được giữ', okText: 'Rời lớp' }}
                                    onClick={() => removeStudent(s)}
                                  />
                                </Space>
                              ),
                            },
                          ]
                        : []),
                    ]}
                  />
                </>
              ),
            },
            {
              key: 'exams',
              label: `Bài kiểm tra (${exams.data?.total ?? 0})`,
              children: (
                <>
                  <AddButton isRender={canExam} text="Tạo bài kiểm tra" style={{ marginBottom: 12 }} onClick={() => setExamForm(true)} />
                  <Table
                    rowKey="id"
                    size="small"
                    loading={exams.isLoading}
                    dataSource={exams.data?.items}
                    pagination={false}
                    onRow={(r) => ({ onClick: () => navigate(RoutePaths.examDetail(r.id)), style: { cursor: 'pointer' } })}
                    columns={[
                      { title: 'Ngày', dataIndex: 'examDate', width: 100, render: (v: string) => formatDate(v) },
                      {
                        title: 'Bài kiểm tra',
                        dataIndex: 'title',
                        render: (v: string, e) => (
                          <>
                            {v} <span className="muted">· {e.category?.name ?? 'Chưa chọn loại'} · x{e.effectiveWeight}</span>
                            {e.gradingMode === 'MANUAL' && <Tag color="purple" style={{ marginLeft: 6 }}>Nhập điểm tay</Tag>}
                          </>
                        ),
                      },
                      { title: 'Đã chấm', key: 'graded', width: 90, render: (_, e) => `${e.counts.GRADED}/${e.counts.total}` },
                    ]}
                  />
                </>
              ),
            },
          ]}
        />
      </Card>

      <ClassFormModal open={classForm} value={c ?? null} onClose={() => setClassForm(false)} onSaved={() => void cls.refetch()} />
      <StudentFormModal
        open={studentForm.open}
        classId={id}
        value={studentForm.value}
        onClose={() => setStudentForm({ open: false, value: null })}
        onSaved={() => refreshStudents.mutate(undefined)}
      />
      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        type="students"
        specParams={{ classId: id }}
        uploadUrl={`/classes/${id}/students/import`}
        onSaved={() => refreshStudents.mutate(undefined)}
      />
      <ExamFormModal open={examForm} value={null} defaultClassId={id} onClose={() => setExamForm(false)} onSaved={(e) => navigate(RoutePaths.examDetail(e.id))} />
      <Modal
        open={!!transfer}
        title={`Chuyển lớp: ${transfer?.student.fullName ?? ''}`}
        okText="Chuyển"
        cancelText="Huỷ"
        okButtonProps={{ disabled: !transfer?.to }}
        onOk={doTransfer}
        onCancel={() => setTransfer(null)}
      >
        <p className="muted">Điểm ở lớp cũ vẫn được giữ.</p>
        <Select
          style={{ width: '100%' }}
          placeholder="Chọn lớp mới"
          value={transfer?.to}
          onChange={(v) => setTransfer((t) => (t ? { ...t, to: v } : t))}
          showSearch={{ optionFilterProp: 'label' }}
          options={(classOptions.data ?? []).filter((o) => o.id !== id).map((o) => ({ value: o.id, label: o.label }))}
        />
      </Modal>
    </div>
  );
}
