import { CalendarOutlined, DeleteOutlined, DownOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, DatePicker, Dropdown, Flex, Form, Input, InputNumber, Modal, Popover, Segmented, Space, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PMS, RoutePaths } from '@missngoc/core';
import { del, downloadBlob, errorMessage, post, put, saveBlob } from '../../api/client';
import { qk, useClass, useGradebook } from '../../api/queries';
import type { GbCell, GbColumn, GbRow, Gradebook } from '../../api/types';
import { ExportExcelButton } from '../../components/buttons';
import { PageHeader } from '../../components/PageHeader';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useCan } from '../../store';
import { ExamFormModal } from '../exams/ExamFormModal';

type Period = { mode: 'all' } | { mode: 'month'; month: Dayjs };
type Active = { row: string; col: string } | null;

const LEFT_KINDS = new Set(['stt', 'studentCode', 'fullName', 'average', 'rank']);

const cellStyle = (c?: GbCell): React.CSSProperties | undefined =>
  c?.style ? { background: c.style.fill, color: c.style.font, fontWeight: c.style.bold ? 600 : undefined } : undefined;

/** Ô nhập điểm tay: số, Vắng, Xoá */
function ScoreEditor({ cell, max, onSave }: { cell: GbCell; max: number; onSave: (score: number | null, absent?: boolean) => void }) {
  const [v, setV] = useState<number | null>(typeof cell.value === 'number' ? cell.value : null);
  return (
    <Space orientation="vertical" size={8} style={{ width: 200 }}>
      <Space.Compact style={{ width: '100%' }}>
        <InputNumber
          autoFocus
          min={0}
          max={max}
          step={0.25}
          value={v}
          onChange={setV}
          onPressEnter={() => onSave(v)}
          placeholder={`0–${max}`}
          style={{ width: '100%' }}
        />
        <Button type="primary" onClick={() => onSave(v)}>
          Lưu
        </Button>
      </Space.Compact>
      <Flex gap={8}>
        <Button size="small" onClick={() => onSave(null, true)}>
          Vắng
        </Button>
        <Button size="small" danger onClick={() => onSave(null)}>
          Xoá điểm
        </Button>
      </Flex>
    </Space>
  );
}

/**
 * Sổ điểm lớp: điểm danh, bài tập về nhà, điểm các bài kiểm tra (AI chấm hoặc nhập tay),
 * điểm trung bình có hệ số và xếp hạng. Màu theo mẫu sổ điểm trong Quản trị.
 */
export function GradebookPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const canEdit = useCan(PMS.ATT_USER, PMS.GRD_USER);
  const canAddExam = useCan(PMS.ATT_USER, PMS.EXAM_AD);
  const cls = useClass(id);

  const [period, setPeriod] = useState<Period>({ mode: 'all' });
  const params = useMemo(
    () =>
      period.mode === 'month'
        ? { from: period.month.startOf('month').format('YYYY-MM-DD'), to: period.month.endOf('month').format('YYYY-MM-DD') }
        : {},
    [period],
  );
  const gb = useGradebook(id, params);
  const g = gb.data;
  const queryKey = qk.gradebook(id, params);

  const [active, setActive] = useState<Active>(null);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [examOpen, setExamOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sessionForm] = Form.useForm<{ date: Dayjs; note?: string }>();

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['classes', id, 'gradebook'] });

  /** Sửa ngay trên lưới để điểm danh nhanh, rồi tải lại để tính lại tổng buổi và trung bình */
  const patchCell = (studentId: string, key: string, value: string | null) => {
    queryClient.setQueryData<Gradebook>(queryKey, (old) => {
      if (!old) return old;
      const codes = key.startsWith('att:') ? old.attendanceCodes : old.homeworkCodes;
      const conf = codes.find((c) => c.code === value);
      return {
        ...old,
        rows: old.rows.map((r) =>
          r.studentId === studentId ? { ...r, cells: { ...r.cells, [key]: { value, style: conf?.fill || conf?.font ? { fill: conf.fill, font: conf.font } : undefined } } } : r,
        ),
      };
    });
  };

  const setAttendance = async (col: GbColumn, items: { studentId: string; value: string | null }[]) => {
    const field = col.kind === 'attendance' ? 'status' : 'homework';
    setActive(null);
    items.forEach((i) => patchCell(i.studentId, col.key, i.value));
    try {
      await put(`/class-sessions/${col.sessionId}/attendance`, { items: items.map((i) => ({ studentId: i.studentId, [field]: i.value })) });
    } catch (err) {
      message.error(errorMessage(err));
    }
    refresh();
  };

  const setScore = async (col: GbColumn, studentId: string, score: number | null, absent?: boolean) => {
    setActive(null);
    try {
      await put(`/exams/${col.examId}/scores/${studentId}`, { score, absent });
      void queryClient.invalidateQueries({ queryKey: qk.exam(col.examId!) });
      void queryClient.invalidateQueries({ queryKey: qk.submissions(col.examId!) });
    } catch (err) {
      message.error(errorMessage(err));
    }
    refresh();
  };

  const addSession = async () => {
    const v = await sessionForm.validateFields();
    try {
      await post(`/classes/${id}/sessions`, { date: v.date.format('YYYY-MM-DD'), note: v.note || undefined });
      message.success(`Đã thêm buổi ${v.date.format('DD/MM')}`);
      setSessionOpen(false);
      refresh();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const deleteSession = (col: GbColumn) =>
    modal.confirm({
      title: `Xoá buổi ${col.title} (${col.subtitle})?`,
      content: 'Điểm danh và bài tập của buổi này sẽ bị xoá. Điểm các bài kiểm tra không bị ảnh hưởng.',
      okText: 'Xoá buổi',
      okButtonProps: { danger: true },
      cancelText: 'Huỷ',
      onOk: async () => {
        try {
          await del(`/class-sessions/${col.sessionId}`);
          refresh();
        } catch (err) {
          message.error(errorMessage(err));
        }
      },
    });

  const exportXlsx = async () => {
    setExporting(true);
    try {
      const { blob, fileName } = await downloadBlob(`/classes/${id}/gradebook`, { params: { ...params, format: 'xlsx' } });
      saveBlob(blob, fileName ?? 'so-diem.xlsx');
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const columns: ColumnsType<GbRow> = (g?.columns ?? []).map((c) => {
    const isLeft = LEFT_KINDS.has(c.kind);
    const editableRow = (r: GbRow) => canEdit && r.inClass;
    const presentCode = g?.attendanceCodes.find((a) => a.present)?.code;

    let title: React.ReactNode = (
      <div className="gb-head">
        <div>{c.title}</div>
        {c.subtitle && <div className="gb-head-sub">{c.subtitle}</div>}
      </div>
    );
    if (c.kind === 'attendance' && canEdit && g) {
      title = (
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              { key: 'all', icon: <TeamOutlined />, label: `Học sinh chưa điểm danh: ${presentCode ?? ''}`, disabled: !presentCode },
              { type: 'divider' },
              { key: 'delete', icon: <DeleteOutlined />, label: 'Xoá buổi học', danger: true },
            ],
            onClick: ({ key }) => {
              if (key === 'delete') deleteSession(c);
              if (key === 'all' && presentCode) {
                const empty = g.rows.filter((r) => r.inClass && !r.cells[c.key]?.value).map((r) => ({ studentId: r.studentId, value: presentCode }));
                if (empty.length) void setAttendance(c, empty);
              }
            },
          }}
        >
          <div className="gb-head gb-head-action">
            <div>
              {c.title} <DownOutlined className="gb-head-caret" />
            </div>
            <div className="gb-head-sub">{c.subtitle}</div>
          </div>
        </Dropdown>
      );
    } else if (c.kind === 'score') {
      title = (
        <Tooltip title={`Mở bài kiểm tra · thang ${c.maxScore} · hệ số ${c.weight}`}>
          <div className="gb-head gb-head-action" onClick={() => navigate(RoutePaths.examDetail(c.examId!))}>
            <div className="gb-head-title">{c.title}</div>
            <div className="gb-head-sub">{c.subtitle}</div>
          </div>
        </Tooltip>
      );
    }

    return {
      key: c.key,
      title,
      width: Math.max(c.width * 9, c.kind === 'fullName' ? 180 : 56),
      fixed: isLeft && (!isMobile || c.kind === 'fullName') ? ('left' as const) : undefined,
      align: c.kind === 'fullName' || c.kind === 'studentCode' ? undefined : ('center' as const),
      onHeaderCell: () => ({ style: { background: c.header.fill, color: c.header.font } }),
      onCell: (r: GbRow) => {
        const cell = r.cells[c.key];
        const editable =
          (c.kind === 'attendance' || c.kind === 'homework' || (c.kind === 'score' && c.gradingMode === 'MANUAL')) && editableRow(r);
        const openReview = c.kind === 'score' && c.gradingMode === 'AI' && !!cell?.submissionId && typeof cell.value === 'number';
        return {
          style: { ...cellStyle(cell), cursor: editable || openReview ? 'pointer' : undefined },
          onClick: () => {
            if (editable) setActive({ row: r.key, col: c.key });
            else if (openReview) navigate(RoutePaths.submissionReview(c.examId!, cell!.submissionId!));
          },
        };
      },
      render: (_: unknown, r: GbRow) => {
        const cell = r.cells[c.key];
        let content: React.ReactNode = cell?.value ?? '';
        if (c.kind === 'fullName') {
          content = (
            <>
              {cell?.value} {!r.inClass && <Tag>Đã rời lớp</Tag>}
            </>
          );
        } else if (c.kind === 'score' && cell?.pending) {
          content = <Tooltip title="Bài AI chấm còn chờ duyệt, điểm có thể còn đổi">{cell.value}*</Tooltip>;
        }
        if (!g || active?.row !== r.key || active.col !== c.key) return content;

        const editor =
          c.kind === 'score' ? (
            <ScoreEditor cell={cell ?? { value: null }} max={c.maxScore ?? 10} onSave={(score, absent) => void setScore(c, r.studentId, score, absent)} />
          ) : (
            <Space orientation="vertical" size={8}>
              <Segmented
                size="large"
                value={(cell?.value as string) ?? undefined}
                onChange={(v) => void setAttendance(c, [{ studentId: r.studentId, value: String(v) }])}
                options={(c.kind === 'attendance' ? g.attendanceCodes : g.homeworkCodes).map((code) => ({
                  value: code.code,
                  label: <Tooltip title={code.label}>{code.code}</Tooltip>,
                }))}
              />
              {cell?.value && (
                <Button size="small" danger onClick={() => void setAttendance(c, [{ studentId: r.studentId, value: null }])}>
                  Xoá
                </Button>
              )}
            </Space>
          );
        return (
          <Popover
            open
            trigger="click"
            title={`${r.cells.fullName?.value} · ${c.kind === 'homework' ? 'Bài tập' : c.title}${c.subtitle ? ` · ${c.subtitle}` : ''}`}
            content={editor}
            onOpenChange={(o) => !o && setActive(null)}
          >
            <span>{content || ' '}</span>
          </Popover>
        );
      },
    };
  });

  return (
    <div>
      <PageHeader
        back={{ label: cls.data?.name ?? 'Lớp học', to: RoutePaths.classDetail(id) }}
        title={g?.title ?? 'Sổ điểm'}
        subtitle={g?.subtitle}
        actions={
          <>
            {canEdit && (
              <Button
                icon={<CalendarOutlined />}
                onClick={() => {
                  sessionForm.setFieldsValue({ date: dayjs(), note: undefined });
                  setSessionOpen(true);
                }}
              >
                Thêm buổi học
              </Button>
            )}
            {canAddExam && (
              <Button icon={<PlusOutlined />} onClick={() => setExamOpen(true)}>
                Thêm cột điểm
              </Button>
            )}
            <ExportExcelButton loading={exporting} onClick={exportXlsx} disabled={!g} />
          </>
        }
      />

      <Flex gap={8} wrap align="center" style={{ marginBottom: 12 }}>
        <Segmented
          value={period.mode}
          onChange={(v) => setPeriod(v === 'month' ? { mode: 'month', month: dayjs() } : { mode: 'all' })}
          options={[
            { label: 'Cả khoá', value: 'all' },
            { label: 'Theo tháng', value: 'month' },
          ]}
        />
        {period.mode === 'month' && (
          <DatePicker picker="month" format="MM/YYYY" allowClear={false} value={period.month} onChange={(m) => m && setPeriod({ mode: 'month', month: m })} />
        )}
      </Flex>

      <Card styles={{ body: { padding: 0 } }}>
        <Table<GbRow>
          className="gb-table"
          rowKey="key"
          size="small"
          bordered
          sticky
          loading={gb.isLoading || gb.isFetching}
          pagination={false}
          dataSource={g?.rows}
          columns={columns}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: 'Lớp chưa có học sinh' }}
        />
      </Card>

      {g && (
        <p className="hint">
          Điểm danh: {g.attendanceCodes.map((c) => `${c.code} = ${c.label}`).join(', ')} · Bài tập: {g.homeworkCodes.map((c) => `${c.code} = ${c.label}`).join(', ')} · V = vắng
          kiểm tra, không tính vào điểm trung bình · * = AI chấm, chờ duyệt · Điểm dưới {g.lowScore.below} (thang 10) được tô màu.
          {canEdit && ' Chạm vào ô để điểm danh hoặc nhập điểm; chạm tiêu đề buổi để điểm danh cả lớp.'}
        </p>
      )}

      <Modal open={sessionOpen} title="Thêm buổi học" okText="Thêm" cancelText="Huỷ" onOk={addSession} onCancel={() => setSessionOpen(false)} destroyOnHidden>
        <Form form={sessionForm} layout="vertical" requiredMark="optional">
          <Form.Item name="date" label="Ngày học" rules={[{ required: true, message: 'Chọn ngày' }]} extra="Buổi không kiểm tra thì chỉ có điểm danh và bài tập">
            <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="note" label="Ghi chú">
            <Input maxLength={200} placeholder="Ví dụ: Unit 2 lesson 3" />
          </Form.Item>
        </Form>
      </Modal>

      <ExamFormModal
        open={examOpen}
        value={null}
        defaultClassId={id}
        defaultMode="MANUAL"
        defaultDate={period.mode === 'month' && !period.month.isSame(dayjs(), 'month') ? period.month.startOf('month').format('YYYY-MM-DD') : undefined}
        onClose={() => setExamOpen(false)}
        onSaved={() => refresh()}
      />
    </div>
  );
}
