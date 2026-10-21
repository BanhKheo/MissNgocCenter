import { BookOutlined, CameraOutlined, CodeOutlined, DeleteOutlined, FormOutlined, TableOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Descriptions, Flex, Row, Statistic, Table, Tag } from 'antd';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DEFAULT_VERSION_URL_PARAM, GRADING_MODE_LABEL, PMS, RoutePaths, SUBMISSION_STATUS_LABEL, type SubmissionStatus } from '@missngoc/core';
import { del, errorMessage, patch } from '../../api/client';
import { qk, useAnswerKeys, useExam, useSubmissions } from '../../api/queries';
import type { AnswerKeyGrid, SubmissionRow } from '../../api/types';
import { ArchiveButton, EditButton, ImportExcelButton, RowAction } from '../../components/buttons';
import { ImportModal } from '../../components/ImportModal';
import { PageHeader } from '../../components/PageHeader';
import { StatusTag } from '../../components/StatusTag';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useCan } from '../../store';
import { formatDate } from '../../utils/format';
import { AnswerKeyEditor } from './AnswerKeyEditor';
import { ExamFormModal } from './ExamFormModal';
import { keyStatus } from './ExamListPage';
import { GeneratePanel } from './GeneratePanel';

const COUNT_ORDER: SubmissionStatus[] = ['NO_IMAGE', 'UPLOADED', 'QUEUED', 'PROCESSING', 'NEEDS_REVIEW', 'GRADED', 'FAILED', 'ABSENT'];

/** Lưới đáp án để dò lại với đáp án giấy (bản xem trước khi import) */
export function KeyPreview({ keys }: { keys: AnswerKeyGrid[] }) {
  return (
    <Card size="small" title="Dò lại với đáp án giấy trước khi lưu" style={{ marginBottom: 8 }}>
      {keys.map((k) => (
        <div key={k.versionCode} style={{ marginBottom: 8 }}>
          <b>{k.versionCode ? `Mã đề ${k.versionCode}` : 'Mã đề chung'}</b>
          <div className="key-preview">
            {k.items.map((it) => (
              <span key={it.q}>
                {it.q}-{it.correct.join('/')}
              </span>
            ))}
          </div>
        </div>
      ))}
    </Card>
  );
}

export function ExamDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const canExam = useCan(PMS.EXAM_AD);
  const canGrade = useCan(PMS.GRD_USER);
  const canAtt = useCan(PMS.ATT_USER);
  const canReport = useCan(PMS.RPT_AD, PMS.RPT_USER);
  const exam = useExam(id);
  const keys = useAnswerKeys(id, canExam || canGrade);
  const subs = useSubmissions(id);
  const [editKeys, setEditKeys] = useState(false);
  const [importKeys, setImportKeys] = useState(false);
  const [editExam, setEditExam] = useState(false);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: qk.exam(id) });
    void queryClient.invalidateQueries({ queryKey: qk.answerKeys(id) });
    void queryClient.invalidateQueries({ queryKey: qk.submissions(id) });
    void queryClient.invalidateQueries({ queryKey: qk.report(id) });
  };

  const deleteKey = async (code: string) => {
    try {
      await del(`/exams/${id}/answer-keys/${code || DEFAULT_VERSION_URL_PARAM}`);
      message.success('Đã xoá đáp án');
      refresh();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const toggleArchive = async () => {
    try {
      await patch(`/exams/${id}`, { status: e?.status === 'ARCHIVED' ? 'OPEN' : 'ARCHIVED' });
      refresh();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const e = exam.data;
  if (!e) return <Card loading />;
  const needsReview = (subs.data ?? []).filter((s) => s.status === 'NEEDS_REVIEW');
  const manual = e.gradingMode === 'MANUAL';
  // Bài nhập điểm tay: giáo viên có quyền điểm danh cũng sửa được
  const canEditExam = canExam || (manual && canAtt);
  const weightLabel = `x${e.effectiveWeight}${e.weight === null ? (e.category ? ' (theo loại bài)' : ' (mặc định)') : ' (hệ số riêng)'}`;

  return (
    <div>
      <PageHeader
        back={{ label: 'Bài kiểm tra', to: RoutePaths.exams }}
        title={e.title}
        tags={e.status === 'ARCHIVED' && <Tag>Đã lưu trữ</Tag>}
        subtitle={
          <>
            <a onClick={() => navigate(RoutePaths.classDetail(e.class.id))}>{e.class.name}</a> · {formatDate(e.examDate)}
          </>
        }
        actions={
          <>
            {canGrade && !manual && (
              <Button icon={<CameraOutlined />} onClick={() => navigate(`${RoutePaths.capture}?examId=${id}`)}>
                Chụp bài
              </Button>
            )}
            <Button icon={<BookOutlined />} onClick={() => navigate(RoutePaths.classGradebook(e.class.id))}>
              Sổ điểm lớp
            </Button>
            {canGrade && needsReview.length > 0 && (
              <Button icon={<FormOutlined />} onClick={() => navigate(RoutePaths.examReview(id))}>
                Duyệt ({needsReview.length})
              </Button>
            )}
            {canReport && (
              <Button type="primary" ghost icon={<TableOutlined />} onClick={() => navigate(RoutePaths.examReport(id))}>
                Bảng điểm
              </Button>
            )}
            <EditButton isRender={canEditExam} onClick={() => setEditExam(true)} />
            <ArchiveButton
              isRender={canEditExam}
              archived={e.status === 'ARCHIVED'}
              confirmTitle={{ archive: 'Lưu trữ bài này? Bài sẽ ẩn khỏi danh sách, điểm vẫn giữ.', restore: 'Mở lại bài này?' }}
              onConfirm={toggleArchive}
            />
          </>
        }
      />

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={10}>
          <Card title={manual ? 'Thông tin' : 'Thông tin và đáp án'} size="small">
            <Descriptions size="small" column={1}>
              <Descriptions.Item label="Cách chấm">{GRADING_MODE_LABEL[e.gradingMode]}</Descriptions.Item>
              <Descriptions.Item label="Loại bài">{e.category?.name ?? 'Chưa chọn'}</Descriptions.Item>
              <Descriptions.Item label="Hệ số">{weightLabel}</Descriptions.Item>
              {!manual && (
                <Descriptions.Item label="Số câu">
                  {e.questionCount} câu · lựa chọn {e.options.split('').join(', ')}
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Thang điểm">{e.maxScore}</Descriptions.Item>
              {e.layoutHint && <Descriptions.Item label="Bố cục">{e.layoutHint}</Descriptions.Item>}
              {!manual && <Descriptions.Item label="Đáp án">{keyStatus(e)}</Descriptions.Item>}
            </Descriptions>
            {(keys.data ?? []).map((k) => (
              <Flex key={k.versionCode} className="row-divider" justify="space-between" align="center" gap={8}>
                <div style={{ minWidth: 0 }}>
                  <b>{k.versionCode ? `Mã đề ${k.versionCode}` : 'Mã đề chung'}</b>
                  <div className="muted mono">
                    {k.items.map((i) => (i.kind === 'text' ? `[${i.correct.join('/')}]` : i.correct.join('/'))).join('')}
                  </div>
                </div>
                <RowAction
                  isRender={canExam}
                  icon={<DeleteOutlined />}
                  label="Xoá đáp án mã đề này"
                  danger
                  confirm={{ title: 'Xoá đáp án mã đề này?', okText: 'Xoá' }}
                  onClick={() => deleteKey(k.versionCode)}
                />
              </Flex>
            ))}
            {canExam && !manual && (
              <Flex gap={8} wrap style={{ marginTop: 8 }}>
                <EditButton text="Nhập đáp án" onClick={() => setEditKeys(true)} />
                <ImportExcelButton onClick={() => setImportKeys(true)} />
                <Button icon={<CodeOutlined />} onClick={() => navigate(RoutePaths.examDsl(id))}>
                  Soạn bằng ExamDSL
                </Button>
              </Flex>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card title={manual ? 'Nhập điểm' : 'Chấm bài'} size="small">
            <Flex wrap gap={16} style={{ marginBottom: 12 }}>
              {(manual ? (['NO_IMAGE', 'GRADED', 'ABSENT'] as const) : COUNT_ORDER)
                .filter((s) => e.counts[s] > 0 || s === 'GRADED')
                .map((s) => (
                  <Statistic key={s} title={manual && s === 'NO_IMAGE' ? 'Chưa có điểm' : SUBMISSION_STATUS_LABEL[s]} value={e.counts[s]} />
                ))}
            </Flex>
            {manual ? (
              <Flex gap={8} wrap align="center">
                <Button type="primary" icon={<BookOutlined />} onClick={() => navigate(RoutePaths.classGradebook(e.class.id))}>
                  Nhập điểm trong sổ điểm
                </Button>
                <span className="muted">Chạm vào ô điểm của từng học sinh để nhập, đánh vắng hoặc xoá.</span>
              </Flex>
            ) : (
              (canGrade || canExam) && <GeneratePanel exam={e} canGenerate={canGrade && e.status === 'OPEN'} />
            )}
          </Card>
        </Col>
      </Row>

      <Card title="Bài của từng học sinh" size="small" style={{ marginTop: 12 }} styles={{ body: { padding: 0 } }}>
        <Table<SubmissionRow>
          rowKey="studentId"
          size="small"
          loading={subs.isLoading}
          dataSource={subs.data}
          pagination={false}
          scroll={{ x: true }}
          onRow={(r) => ({
            onClick: () => r.submissionId && ['GRADED', 'NEEDS_REVIEW'].includes(r.status) && navigate(RoutePaths.submissionReview(id, r.submissionId)),
            style: { cursor: r.submissionId && ['GRADED', 'NEEDS_REVIEW'].includes(r.status) ? 'pointer' : undefined },
          })}
          columns={[
            { title: 'STT', key: 'stt', width: 50, render: (_, __, i) => i + 1 },
            {
              title: 'Học sinh',
              dataIndex: 'fullName',
              render: (v: string, r) => (
                <>
                  {v} {!r.inClass && <Tag>Đã rời lớp</Tag>}
                  {r.nameMismatch && <Tag color="orange">Tên trên bài khác</Tag>}
                </>
              ),
            },
            { title: 'Trạng thái', dataIndex: 'status', render: (v: SubmissionStatus, r) => <StatusTag status={v} error={r.lastError} /> },
            ...(isMobile ? [] : [{ title: 'Ảnh', dataIndex: 'imageCount', width: 60 }, { title: 'Mã đề', dataIndex: 'versionCode', width: 70 }]),
            { title: 'Điểm', dataIndex: 'score', width: 70, render: (v: number | null) => (v === null ? '' : <b>{v}</b>) },
            {
              title: 'Không chắc',
              dataIndex: 'uncertainCount',
              width: 100,
              render: (v: number) => (v > 0 ? <Tag color="gold">{v} câu</Tag> : ''),
            },
          ]}
        />
      </Card>

      {keys.data && <AnswerKeyEditor open={editKeys} exam={e} keys={keys.data} onClose={() => setEditKeys(false)} onSaved={refresh} />}
      <ImportModal<AnswerKeyGrid[]>
        open={importKeys}
        onClose={() => setImportKeys(false)}
        type="answer-keys"
        specParams={{ examId: id }}
        uploadUrl={`/exams/${id}/answer-keys/import`}
        onSaved={refresh}
        renderExtra={(grid) => (grid.length ? <KeyPreview keys={grid} /> : null)}
      />
      <ExamFormModal open={editExam} value={e} onClose={() => setEditExam(false)} onSaved={refresh} />
    </div>
  );
}
