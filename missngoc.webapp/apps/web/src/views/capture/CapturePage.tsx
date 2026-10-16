import { CameraOutlined, CheckCircleFilled, CloudUploadOutlined, SearchOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Empty, Flex, Input, Progress, Result, Select, Space, Spin, Tag } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RoutePaths } from '@missngoc/core';
import { errorMessage, isNetworkError, upload } from '../../api/client';
import { qk, useClassOptions, useExam, useExams, useSubmissions } from '../../api/queries';
import type { SubmissionRow } from '../../api/types';
import { StatusTag } from '../../components/StatusTag';
import { StudentCapture } from './StudentCapture';

interface PendingUpload {
  id: number;
  examId: string;
  studentId: string;
  studentName: string;
  blob: Blob;
  error?: string;
}

function remember(key: string, value?: string) {
  try {
    if (value) localStorage.setItem(key, value);
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Chụp bài (FR-CAP-01..09): chọn lớp → chọn bài kiểm tra → chạm học sinh → Chụp bài.
 * Tải xong tự chuyển sang học sinh kế tiếp chưa có ảnh.
 */
export function CapturePage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const paramExam = useExam(params.get('examId') ?? undefined);

  const classes = useClassOptions();
  const [classId, setClassId] = useState<string | undefined>(() => remember('capture.classId'));
  const [examId, setExamId] = useState<string | undefined>(() => params.get('examId') ?? undefined);
  const exams = useExams({ page: 1, pageSize: 50, classId, status: 'OPEN' }, !!classId);
  const subs = useSubmissions(examId, 15_000);

  const [currentId, setCurrentId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [lastSaved, setLastSaved] = useState<{ studentId: string; name: string } | null>(null);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const pendingSeq = useRef(0);

  // Mở từ trang bài kiểm tra (?examId=): chọn đúng lớp của bài đó
  useEffect(() => {
    if (paramExam.data) setClassId(paramExam.data.class.id);
  }, [paramExam.data]);

  useEffect(() => {
    if (!classes.data?.length) return;
    if (!classId || !classes.data.some((c) => c.id === classId)) setClassId(classes.data[0].id);
  }, [classes.data, classId]);

  // Mặc định chọn bài gần nhất chưa chấm xong của lớp, và nhớ lựa chọn cho lần sau (FR-CAP-02)
  useEffect(() => {
    if (!classId || !exams.data) return;
    const list = exams.data.items;
    if (examId && list.some((e) => e.id === examId)) return;
    const saved = remember(`capture.exam.${classId}`);
    const pick =
      list.find((e) => e.id === saved) ?? list.find((e) => e.counts.NO_IMAGE > 0 || e.counts.UPLOADED > 0) ?? list[0];
    setExamId(pick?.id);
  }, [classId, exams.data, examId]);

  useEffect(() => {
    if (classId) remember('capture.classId', classId);
    if (classId && examId) remember(`capture.exam.${classId}`, examId);
  }, [classId, examId]);

  const rows = useMemo(() => (subs.data ?? []).filter((r) => r.inClass), [subs.data]);
  const pendingFor = useCallback((studentId: string) => pending.some((p) => p.studentId === studentId), [pending]);
  const hasImage = useCallback((r: SubmissionRow) => r.imageCount > 0 || pendingFor(r.studentId), [pendingFor]);
  const present = rows.filter((r) => r.status !== 'ABSENT');
  const done = present.filter(hasImage).length;
  const current = rows.find((r) => r.studentId === currentId) ?? null;
  const exam = exams.data?.items.find((e) => e.id === examId);

  const refresh = useCallback(() => {
    if (!examId) return;
    void queryClient.invalidateQueries({ queryKey: qk.submissions(examId) });
    void queryClient.invalidateQueries({ queryKey: ['submissions'] });
    void queryClient.invalidateQueries({ queryKey: ['exams'] });
  }, [examId, queryClient]);

  /** Học sinh kế tiếp chưa có ảnh, tính từ học sinh vừa chụp */
  const nextAfter = useCallback(
    (studentId: string): SubmissionRow | null => {
      const start = rows.findIndex((r) => r.studentId === studentId);
      for (let i = 1; i <= rows.length; i++) {
        const r = rows[(start + i) % rows.length];
        if (r.studentId !== studentId && r.status !== 'ABSENT' && !hasImage(r)) return r;
      }
      return null;
    },
    [rows, hasImage],
  );

  const afterSaved = (row: SubmissionRow) => {
    setLastSaved({ studentId: row.studentId, name: row.fullName });
    const next = nextAfter(row.studentId);
    setCurrentId(next?.studentId ?? null);
    refresh();
  };

  // Mạng chập chờn: ảnh chờ trên điện thoại và tự tải lại (FR-CAP-09)
  const queueUpload = (row: SubmissionRow, blob: Blob) => {
    pendingSeq.current += 1;
    setPending((p) => [...p, { id: pendingSeq.current, examId: examId!, studentId: row.studentId, studentName: row.fullName, blob }]);
  };

  const retryPending = useCallback(async () => {
    for (const item of pending) {
      if (item.error) continue;
      try {
        await upload(`/exams/${item.examId}/submissions/${item.studentId}/images`, item.blob, 'bai.jpg');
        setPending((p) => p.filter((x) => x.id !== item.id));
        refresh();
      } catch (err) {
        if (isNetworkError(err)) return; // vẫn mất mạng, lần sau thử tiếp
        setPending((p) => p.map((x) => (x.id === item.id ? { ...x, error: errorMessage(err) } : x)));
      }
    }
  }, [pending, refresh]);

  useEffect(() => {
    if (pending.length === 0) return;
    const timer = window.setInterval(() => void retryPending(), 5000);
    const onOnline = () => void retryPending();
    window.addEventListener('online', onOnline);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', onOnline);
    };
  }, [pending.length, retryPending]);

  useEffect(() => {
    if (pending.length === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending.length]);

  const filtered = keyword
    ? rows.filter((r) => r.fullName.toLowerCase().includes(keyword.toLowerCase()) || r.studentCode.toLowerCase().includes(keyword.toLowerCase()))
    : rows;

  const pendingBanner = pending.length > 0 && (
    <Alert
      type={pending.some((p) => p.error) ? 'error' : 'warning'}
      showIcon
      icon={<CloudUploadOutlined />}
      style={{ marginBottom: 12 }}
      title={`${pending.filter((p) => !p.error).length} ảnh đang chờ tải lại khi có mạng. Đừng đóng trang này.`}
      description={pending
        .filter((p) => p.error)
        .map((p) => (
          <div key={p.id}>
            {p.studentName}: {p.error}{' '}
            <Button size="small" type="link" onClick={() => setPending((x) => x.filter((y) => y.id !== p.id))}>
              Bỏ ảnh này
            </Button>
          </div>
        ))}
      action={
        <Button size="small" onClick={() => void retryPending()}>
          Thử ngay
        </Button>
      }
    />
  );

  if (current && examId && exam) {
    return (
      <>
        {pendingBanner}
        <StudentCapture
          key={current.studentId}
          exam={exam}
          row={current}
          rows={rows}
          pending={pendingFor(current.studentId)}
          lastSaved={lastSaved && lastSaved.studentId !== current.studentId ? lastSaved : null}
          onAddPage={(studentId) => setCurrentId(studentId)}
          onBack={() => setCurrentId(null)}
          onSkip={() => setCurrentId(nextAfter(current.studentId)?.studentId ?? null)}
          onUploaded={() => afterSaved(current)}
          onQueued={(blob) => {
            queueUpload(current, blob);
            message.warning('Mạng yếu: ảnh sẽ tự tải lại khi có mạng');
            afterSaved(current);
          }}
          onChanged={refresh}
        />
      </>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      {pendingBanner}
      <Space orientation="vertical" style={{ width: '100%' }} size={8}>
        <Select
          size="large"
          style={{ width: '100%' }}
          placeholder="Chọn lớp"
          loading={classes.isLoading}
          value={classId}
          onChange={(v) => {
            setClassId(v);
            setExamId(undefined);
          }}
          options={(classes.data ?? []).map((c) => ({ value: c.id, label: c.label }))}
          showSearch={{ optionFilterProp: 'label' }}
        />
        <Select
          size="large"
          style={{ width: '100%' }}
          placeholder="Chọn bài kiểm tra"
          loading={exams.isLoading}
          value={examId}
          onChange={setExamId}
          notFoundContent="Lớp chưa có bài kiểm tra"
          options={(exams.data?.items ?? []).map((e) => ({
            value: e.id,
            label: `${e.title} · ${new Date(e.examDate).toLocaleDateString('vi-VN')}`,
          }))}
        />
      </Space>

      {!classes.isLoading && classes.data?.length === 0 && <Empty style={{ marginTop: 32 }} description="Chưa có lớp nào" />}

      {examId && (
        <>
          <div style={{ margin: '16px 0 8px' }}>
            <Flex justify="space-between" align="baseline">
              <b style={{ fontSize: 16 }}>
                {done}/{present.length} đã có ảnh
              </b>
              <Button type="link" onClick={() => navigate(RoutePaths.examDetail(examId))} style={{ padding: 0 }}>
                Mở trang chấm
              </Button>
            </Flex>
            <Progress percent={present.length ? Math.round((done / present.length) * 100) : 0} showInfo={false} />
          </div>

          {present.length > 0 && done === present.length && (
            <Result
              status="success"
              title="Đã chụp đủ cả lớp"
              subTitle="Mở trang chấm và bấm Generate để chấm bài."
              extra={
                <Button type="primary" size="large" onClick={() => navigate(RoutePaths.examDetail(examId))}>
                  Mở trang chấm
                </Button>
              }
            />
          )}

          <Input
            size="large"
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Tìm theo tên"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ marginBottom: 8 }}
          />

          {subs.isLoading ? (
            <Spin style={{ display: 'block', marginTop: 32 }} />
          ) : rows.length === 0 ? (
            <Empty description="Lớp chưa có học sinh" />
          ) : (
            <Space orientation="vertical" style={{ width: '100%' }} size={6}>
              {filtered.map((r) => (
                <div key={r.studentId} className="capture-student" onClick={() => setCurrentId(r.studentId)}>
                  {hasImage(r) ? (
                    <CheckCircleFilled style={{ color: '#52c41a', fontSize: 22 }} />
                  ) : (
                    <CameraOutlined style={{ color: '#9ca3af', fontSize: 22 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 17, fontWeight: 600 }}>{r.fullName}</div>
                    <div className="muted" style={{ fontSize: 13 }}>
                      {r.studentCode}
                      {r.imageCount > 1 ? ` · ${r.imageCount} trang` : ''}
                    </div>
                  </div>
                  {pendingFor(r.studentId) ? <Tag color="orange">Chờ tải</Tag> : <StatusTag status={r.status} error={r.lastError} />}
                </div>
              ))}
            </Space>
          )}
        </>
      )}
    </div>
  );
}
