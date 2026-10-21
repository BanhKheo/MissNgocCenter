import { CheckOutlined, CloseOutlined, ExclamationCircleOutlined, StepForwardOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Alert, App, Button, Card, Col, Flex, Input, Popover, Row, Segmented, Select, Space, Switch, Tabs, Tag, Tooltip } from 'antd';
import { Fragment, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MARK_STATUS_LABEL, MAX_TEXT_ANSWER, PMS, RoutePaths } from '@missngoc/core';
import { errorMessage, patch, post } from '../../api/client';
import { qk, useSubmission, useSubmissions } from '../../api/queries';
import type { SubmissionDetail } from '../../api/types';
import { AuthImage } from '../../components/AuthImage';
import { PageHeader } from '../../components/PageHeader';
import { StatusTag } from '../../components/StatusTag';
import { useCan } from '../../store';

/** Sửa câu điền từ: chép đúng chữ học sinh viết, kể cả sai chính tả */
function TextAnswerForm({ value, saving, onSave }: { value: string | null; saving: boolean; onSave: (v: string | null) => void }) {
  const [text, setText] = useState(value ?? '');
  const submit = () => onSave(text.replace(/\s+/g, ' ').trim() || null);
  return (
    <div style={{ width: 280 }}>
      <Space.Compact style={{ width: '100%' }}>
        <Input autoFocus value={text} maxLength={MAX_TEXT_ANSWER} placeholder="Chữ học sinh viết" onChange={(e) => setText(e.target.value)} onPressEnter={submit} />
        <Button type="primary" loading={saving} onClick={submit}>
          Lưu
        </Button>
      </Space.Compact>
      <p className="hint">Chép đúng chữ trên bài, kể cả sai chính tả. Để trống là bỏ trống.</p>
    </div>
  );
}

/**
 * Duyệt kết quả AI (UC-08): ảnh cạnh lưới câu, câu không chắc tô vàng, sửa 1 chạm.
 * Mỗi lần sửa gửi kèm If-Match: version; người khác vừa sửa thì báo và tải lại.
 */
export function SubmissionReviewPage() {
  const { id: examId = '', submissionId = '' } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const canEdit = useCan(PMS.GRD_USER);
  const sub = useSubmission(submissionId);
  const list = useSubmissions(examId);
  const [onlyUncertain, setOnlyUncertain] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openQ, setOpenQ] = useState<number | null>(null);

  const d = sub.data;
  const options = d?.exam.options.split('') ?? [];
  const uncertainCount = d?.answers.filter((a) => a.needsReview).length ?? 0;
  const shown = useMemo(
    () => (d ? (onlyUncertain && uncertainCount > 0 ? d.answers.filter((a) => a.needsReview || a.reviewed) : d.answers) : []),
    [d, onlyUncertain, uncertainCount],
  );

  const nextToReview = () => {
    const queue = (list.data ?? []).filter((s) => s.status === 'NEEDS_REVIEW' && s.submissionId && s.submissionId !== submissionId);
    return queue[0]?.submissionId ?? null;
  };

  const apply = (updated: SubmissionDetail) => {
    queryClient.setQueryData(qk.submission(submissionId), updated);
    void queryClient.invalidateQueries({ queryKey: qk.submissions(examId) });
    void queryClient.invalidateQueries({ queryKey: qk.report(examId) });
  };

  const handleError = (err: unknown) => {
    if (axios.isAxiosError(err) && err.response?.status === 412) {
      message.warning('Bài này vừa được người khác sửa. Đã tải lại bản mới nhất');
      void sub.refetch();
    } else message.error(errorMessage(err));
  };

  const setAnswer = async (q: number, choice: string | null) => {
    if (!d) return;
    setOpenQ(null);
    setSaving(true);
    try {
      apply(await patch<SubmissionDetail>(`/submissions/${d.id}/answers/${q}`, { finalChoice: choice }, { headers: { 'If-Match': String(d.version) } }));
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  };

  const setVersion = async (versionCode: string) => {
    if (!d) return;
    try {
      apply(await patch<SubmissionDetail>(`/submissions/${d.id}`, { versionCode }, { headers: { 'If-Match': String(d.version) } }));
    } catch (err) {
      handleError(err);
    }
  };

  const confirm = async () => {
    if (!d) return;
    setSaving(true);
    try {
      apply(await post<SubmissionDetail>(`/submissions/${d.id}/confirm`, undefined, { headers: { 'If-Match': String(d.version) } }));
      message.success(`Đã duyệt bài của ${d.student.fullName}`);
      const next = nextToReview();
      if (next) navigate(RoutePaths.submissionReview(examId, next), { replace: true });
      else {
        message.info('Đã duyệt hết bài cần duyệt');
        navigate(RoutePaths.examDetail(examId));
      }
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  };

  if (!d) return <Card loading />;

  const versionSelect = d.exam.versionCodes.length > 1 && (
    <Flex align="center" gap={8}>
      <span>Mã đề:</span>
      <Select
        style={{ width: 140 }}
        value={d.versionCode ?? undefined}
        placeholder="Chọn mã đề"
        disabled={!canEdit}
        status={d.versionCode ? undefined : 'warning'}
        onChange={setVersion}
        options={d.exam.versionCodes.map((v) => ({ value: v, label: v || 'Chung' }))}
      />
    </Flex>
  );

  const grid = (
    <div className="answer-grid">
      {shown.map((a) => {
        const cls = [
          'answer-cell',
          a.kind === 'text' ? 'text' : '',
          a.needsReview ? 'uncertain' : '',
          a.isCorrect === true ? 'right' : a.isCorrect === false ? 'wrong' : '',
        ].join(' ');
        const cell = (
          <div className={cls} onClick={() => canEdit && setOpenQ(a.q)}>
            <div className="q">
              Câu {a.q} {a.isCorrect === true ? <CheckOutlined className="text-success" /> : a.isCorrect === false ? <CloseOutlined className="text-danger" /> : null}
            </div>
            <div className="c">{a.finalChoice ?? '–'}</div>
            {a.isCorrect === false && a.correct && a.correct.length > 0 && (
              <Tooltip title={a.correct.length > 1 ? `Chấp nhận: ${a.correct.join(' / ')}` : undefined}>
                <div className="ok">
                  Đúng: {a.kind === 'text' ? a.correct[0] : a.correct.join('/')}
                  {a.kind === 'text' && a.correct.length > 1 ? ' …' : ''}
                </div>
              </Tooltip>
            )}
            {(a.needsReview || a.status !== 'clear') && (
              <div className="q">
                {a.needsReview && <ExclamationCircleOutlined className="text-warning" />} {MARK_STATUS_LABEL[a.status]}
                {a.reviewed && ' · đã duyệt'}
              </div>
            )}
          </div>
        );
        return canEdit ? (
          <Popover
            key={a.q}
            trigger="click"
            open={openQ === a.q}
            onOpenChange={(o) => setOpenQ(o ? a.q : null)}
            title={
              `Câu ${a.q}: AI đọc ${a.detectedChoice === null ? 'không có' : a.kind === 'text' ? `"${a.detectedChoice}"` : a.detectedChoice} (${MARK_STATUS_LABEL[a.status]})` +
              (a.correct?.length ? ` · Đáp án: ${a.correct.join(a.kind === 'text' ? ' / ' : '/')}` : '')
            }
            content={
              a.kind === 'text' ? (
                <TextAnswerForm key={`${a.q}:${a.finalChoice}`} value={a.finalChoice} saving={saving} onSave={(v) => setAnswer(a.q, v)} />
              ) : (
                <Segmented
                  size="large"
                  value={a.finalChoice ?? '–'}
                  onChange={(v) => setAnswer(a.q, v === '–' ? null : String(v))}
                  options={[...options, '–']}
                />
              )
            }
          >
            {cell}
          </Popover>
        ) : (
          <Fragment key={a.q}>{cell}</Fragment>
        );
      })}
    </div>
  );

  return (
    <div>
      <PageHeader
        back={{ label: d.exam.title, to: RoutePaths.examDetail(examId) }}
        title={d.student.fullName}
        subtitle={
          <Space wrap>
            <StatusTag status={d.status} error={d.lastError} />
            {d.result && (
              <Tag color="blue" className="score-tag">
                {d.result.score} điểm · đúng {d.result.correctCount}/{d.exam.questionCount}
              </Tag>
            )}
            {uncertainCount > 0 && <Tag color="gold">{uncertainCount} câu cần duyệt</Tag>}
          </Space>
        }
        actions={
          canEdit && (
            <>
              <Button
                icon={<StepForwardOutlined />}
                onClick={() => {
                  const next = nextToReview();
                  if (next) navigate(RoutePaths.submissionReview(examId, next));
                  else navigate(RoutePaths.examDetail(examId));
                }}
              >
                Bỏ qua
              </Button>
              <Button type="primary" icon={<CheckOutlined />} loading={saving} onClick={confirm} disabled={d.status === 'GRADED' && !d.nameMismatch}>
                Duyệt xong
              </Button>
            </>
          )
        }
      />

      {d.nameMismatch && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 8 }}
          title={`Tên đọc được trên bài: "${d.studentNameRead}". Kiểm tra xem có gắn nhầm học sinh không.`}
          description="Nếu nhầm, mở Chụp bài và chuyển ảnh sang đúng học sinh. Nếu đúng, bấm Duyệt xong."
        />
      )}
      {d.exam.versionCodes.length > 1 && !d.versionCode && (
        <Alert type="warning" showIcon style={{ marginBottom: 8 }} title="AI không đọc được mã đề. Chọn mã đề để tính điểm." />
      )}

      <Row gutter={[12, 12]}>
        <Col xs={24} md={11}>
          <Card size="small" styles={{ body: { padding: 8 } }}>
            {d.images.length > 1 ? (
              <Tabs
                size="small"
                items={d.images.map((img) => ({
                  key: img.id,
                  label: `Trang ${img.pageNo}`,
                  children: <AuthImage imageId={img.id} />,
                }))}
              />
            ) : d.images[0] ? (
              <AuthImage imageId={d.images[0].id} />
            ) : (
              <span className="muted">Không có ảnh</span>
            )}
          </Card>
        </Col>
        <Col xs={24} md={13}>
          <Card
            size="small"
            title={
              <Flex justify="space-between" align="center" wrap gap={8}>
                {versionSelect || <span>Kết quả từng câu</span>}
                {uncertainCount > 0 && (
                  <span className="card-title-control">
                    Chỉ câu cần duyệt <Switch size="small" checked={onlyUncertain} onChange={setOnlyUncertain} />
                  </span>
                )}
              </Flex>
            }
          >
            {grid}
            <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
              Ô vàng là câu AI không chắc. Câu sai có dòng "Đúng: …" là đáp án để so. Chạm vào ô để sửa. Bấm "Duyệt xong" để giữ nguyên các câu còn lại.
            </p>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
