import { CameraOutlined, DeleteOutlined, EditOutlined, FileExcelOutlined, FormOutlined, InboxOutlined, TableOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Col, Descriptions, Flex, Popconfirm, Row, Space, Statistic, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DEFAULT_VERSION_URL_PARAM, PMS, RoutePaths, SUBMISSION_STATUS_LABEL, type SubmissionStatus } from '@missngoc/core';
import { del, errorMessage, patch } from '../../api/client';
import { qk, useAnswerKeys, useExam, useSubmissions } from '../../api/queries';
import type { AnswerKeyGrid, SubmissionRow } from '../../api/types';
import { ImportModal } from '../../components/ImportModal';
import { StatusTag } from '../../components/StatusTag';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useCan } from '../../store';
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

  return (
    <div>
      <Flex justify="space-between" align="flex-start" wrap gap={8} style={{ marginBottom: 12 }}>
        <div>
          <Button type="link" style={{ padding: 0 }} onClick={() => navigate(RoutePaths.exams)}>
            ← Bài kiểm tra
          </Button>
          <h1 className="page-title">
            {e.title} {e.status === 'ARCHIVED' && <Tag>Đã lưu trữ</Tag>}
          </h1>
          <div className="muted">
            <a onClick={() => navigate(RoutePaths.classDetail(e.class.id))}>{e.class.name}</a> · {dayjs(e.examDate).format('DD/MM/YYYY')}
          </div>
        </div>
        <Space wrap>
          {canGrade && (
            <Button icon={<CameraOutlined />} onClick={() => navigate(`${RoutePaths.capture}?examId=${id}`)}>
              Chụp bài
            </Button>
          )}
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
          {canExam && (
            <>
              <Button icon={<EditOutlined />} onClick={() => setEditExam(true)}>
                Sửa
              </Button>
              <Popconfirm title={e.status === 'ARCHIVED' ? 'Mở lại bài này?' : 'Lưu trữ bài này?'} okText="Đồng ý" cancelText="Huỷ" onConfirm={toggleArchive}>
                <Button icon={<InboxOutlined />} />
              </Popconfirm>
            </>
          )}
        </Space>
      </Flex>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={10}>
          <Card title="Thông tin và đáp án" size="small">
            <Descriptions size="small" column={1}>
              <Descriptions.Item label="Số câu">
                {e.questionCount} câu · lựa chọn {e.options.split('').join(', ')}
              </Descriptions.Item>
              <Descriptions.Item label="Thang điểm">{e.maxScore}</Descriptions.Item>
              {e.layoutHint && <Descriptions.Item label="Bố cục">{e.layoutHint}</Descriptions.Item>}
              <Descriptions.Item label="Đáp án">{keyStatus(e)}</Descriptions.Item>
            </Descriptions>
            {(keys.data ?? []).map((k) => (
              <Flex key={k.versionCode} justify="space-between" align="center" style={{ padding: '6px 0', borderTop: '1px solid #f0f0f0' }}>
                <div style={{ minWidth: 0 }}>
                  <b>{k.versionCode ? `Mã đề ${k.versionCode}` : 'Mã đề chung'}</b>
                  <div className="muted" style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12, wordBreak: 'break-all' }}>
                    {k.items.map((i) => (i.kind === 'text' ? `[${i.correct.join('/')}]` : i.correct.join('/'))).join('')}
                  </div>
                </div>
                {canExam && (
                  <Popconfirm title="Xoá đáp án mã đề này?" okText="Xoá" cancelText="Huỷ" onConfirm={() => deleteKey(k.versionCode)}>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                )}
              </Flex>
            ))}
            {canExam && (
              <Flex gap={8} wrap style={{ marginTop: 8 }}>
                <Button icon={<EditOutlined />} onClick={() => setEditKeys(true)}>
                  Nhập đáp án
                </Button>
                <Button icon={<FileExcelOutlined />} onClick={() => setImportKeys(true)}>
                  Import Excel
                </Button>
              </Flex>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card title="Chấm bài" size="small">
            <Flex wrap gap={16} style={{ marginBottom: 12 }}>
              {COUNT_ORDER.filter((s) => e.counts[s] > 0 || s === 'GRADED').map((s) => (
                <Statistic key={s} title={SUBMISSION_STATUS_LABEL[s]} value={e.counts[s]} />
              ))}
            </Flex>
            {(canGrade || canExam) && <GeneratePanel exam={e} canGenerate={canGrade && e.status === 'OPEN'} />}
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
