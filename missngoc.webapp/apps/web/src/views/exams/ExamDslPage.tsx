import { CodeOutlined, DownloadOutlined, PlayCircleOutlined, SaveOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Checkbox, Col, DatePicker, Empty, Flex, Row, Segmented, Select, Space, Statistic, Table, Tabs, Tag } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { DEFAULT_VERSION_URL_PARAM, PMS, RoutePaths } from '@missngoc/core';
import { del, errorMessage, get, patch, post, put } from '../../api/client';
import { dslCompile, dslSimulate, type DslCompileResult, type DslDiagnostic, type DslOutputs, type DslSimulateResult } from '../../api/dsl';
import { qk, useAnswerKeys, useCategories, useClassOptions, useExam } from '../../api/queries';
import type { ExamRow } from '../../api/types';
import { DslEditor, type DslEditorHandle } from '../../components/DslEditor';
import { PageHeader } from '../../components/PageHeader';
import { useCan } from '../../store';
import { newExamSource, sourceFromApp } from './dslSource';

const PHASE: Record<string, string> = { lexical: 'từ vựng', syntax: 'cú pháp', semantic: 'ngữ nghĩa', optimize: 'tối ưu' };
const fmt = (x: number) => (Number.isInteger(x) ? String(x) : String(+x.toFixed(3)).replace('.', ','));
const dslKey = (examId: string) => ['exams', examId, 'dsl'] as const;

/**
 * Soạn đề và đáp án bằng ExamDSL: gõ là kiểm tra, xem trước, mô phỏng luật duyệt, rồi lưu vào bài kiểm tra.
 * /exams/new/dsl là tạo bài mới: lớp, ngày và loại bài không nằm trong file .exam nên chọn ở đầu trang.
 */
export function ExamDslPage() {
  const { id = '' } = useParams();
  const creating = !id;
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const canTemplate = useCan(PMS.SYS_AD);
  const exam = useExam(creating ? undefined : id);
  const keys = useAnswerKeys(id, !creating);
  const saved = useQuery({
    queryKey: dslKey(id),
    queryFn: () => get<{ source: string | null }>(`/exams/${id}/dsl`),
    enabled: !creating,
  });
  const classes = useClassOptions();
  const categories = useCategories();
  const [classId, setClassId] = useState<string | undefined>(params.get('classId') ?? undefined);
  const [examDate, setExamDate] = useState<Dayjs>(params.get('date') ? dayjs(params.get('date')) : dayjs());
  const [categoryId, setCategoryId] = useState<string | null>(params.get('categoryId'));
  const editor = useRef<DslEditorHandle>(null);

  const [source, setSource] = useState<string | null>(null);
  const [savedSource, setSavedSource] = useState<string | null>(null);
  const [result, setResult] = useState<DslCompileResult | null>(null);
  const [serviceDown, setServiceDown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [withReport, setWithReport] = useState(false);

  // Mở trang: lấy mã nguồn đã lưu; bài chưa từng soạn bằng ExamDSL thì dựng từ đáp án đang có
  useEffect(() => {
    if (source !== null) return;
    if (creating) {
      setSource(newExamSource(params.get('title') ?? ''));
      return;
    }
    if (!saved.data || !exam.data || !keys.data) return;
    const initial = saved.data.source ?? sourceFromApp(exam.data, keys.data);
    setSource(initial);
    setSavedSource(saved.data.source);
  }, [saved.data, exam.data, keys.data, source, creating, params]);

  // Biên dịch lại sau mỗi lần ngừng gõ 300 ms
  useEffect(() => {
    if (source === null) return;
    const timer = setTimeout(() => {
      dslCompile(source)
        .then((r) => {
          setResult(r);
          setServiceDown(false);
        })
        .catch(() => setServiceDown(true));
    }, 300);
    return () => clearTimeout(timer);
  }, [source]);

  const diagnostics = result?.diagnostics ?? [];
  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const dirty = source !== null && source !== (savedSource ?? '');

  const save = async () => {
    if (source === null) return;
    const fresh = await dslCompile(source).catch(() => null);
    if (!fresh?.ok || !fresh.outputs) {
      message.error('Còn lỗi trong file đề, sửa xong mới lưu được');
      return;
    }
    const out = fresh.outputs;
    if (creating) return create(out);
    if (!exam.data) return;
    const newCodes = Object.keys(out.keys).map((c) => (c === DEFAULT_VERSION_URL_PARAM ? '' : c));
    const removed = (keys.data ?? []).map((k) => k.versionCode).filter((c) => !newCodes.includes(c));
    const graded = exam.data.counts.GRADED + exam.data.counts.NEEDS_REVIEW;
    const notes = [
      graded > 0 && `${graded} bài đã chấm sẽ được tính lại điểm theo đáp án mới (không gọi lại AI).`,
      removed.length > 0 && `Xoá đáp án các mã đề không còn trong file: ${removed.map((c) => c || 'mã chung').join(', ')}.`,
      withReport && 'Mẫu bảng điểm dùng chung của cả trung tâm sẽ đổi theo khối report.',
    ].filter(Boolean) as string[];
    const run = () => apply(out, removed);
    if (notes.length === 0) return run();
    modal.confirm({
      title: 'Lưu đề vào bài kiểm tra?',
      content: (
        <ul style={{ paddingLeft: 18, margin: 0 }}>
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ),
      okText: 'Lưu',
      onOk: run,
    });
  };

  const apply = async (out: DslOutputs, removed: string[]) => {
    setSaving(true);
    try {
      const { title, questionCount, options, maxScore, layoutHint } = out.exam;
      await patch(`/exams/${id}`, { title, questionCount, options, maxScore, layoutHint: layoutHint ?? null });
      for (const [code, body] of Object.entries(out.keys)) await put(`/exams/${id}/answer-keys/${code}`, body);
      for (const code of removed) await del(`/exams/${id}/answer-keys/${code || DEFAULT_VERSION_URL_PARAM}`);
      if (withReport) await put('/report-templates/default', { config: out.report });
      await put(`/exams/${id}/dsl`, { source });
      setSavedSource(source);
      await Promise.all(
        [qk.exam(id), qk.answerKeys(id), qk.submissions(id), qk.report(id), qk.reportTemplate, dslKey(id)].map((k) =>
          queryClient.invalidateQueries({ queryKey: k }),
        ),
      );
      message.success(`Đã lưu đề: ${questionCount} câu, ${Object.keys(out.keys).length} mã đề`);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  /** Tạo bài mới từ file đề: tạo bài, ghi đáp án, lưu mã nguồn rồi mở trang bài */
  const create = async (out: DslOutputs) => {
    if (!classId) {
      message.error('Chọn lớp cho bài kiểm tra');
      return;
    }
    setSaving(true);
    try {
      const { title, questionCount, options, maxScore, layoutHint } = out.exam;
      const created = await post<ExamRow>('/exams', {
        title,
        questionCount,
        options,
        maxScore,
        layoutHint,
        gradingMode: 'AI',
        classId,
        examDate: examDate.format('YYYY-MM-DD'),
        categoryId: categoryId ?? null,
      });
      for (const [code, body] of Object.entries(out.keys)) await put(`/exams/${created.id}/answer-keys/${code}`, body);
      if (withReport) await put('/report-templates/default', { config: out.report });
      await put(`/exams/${created.id}/dsl`, { source });
      await queryClient.invalidateQueries({ queryKey: ['exams'] });
      message.success(`Đã tạo bài "${created.title}": ${questionCount} câu, ${Object.keys(out.keys).length} mã đề`);
      navigate(RoutePaths.examDetail(created.id));
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const download = () => {
    if (source === null) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([source], { type: 'text/plain;charset=utf-8' }));
    a.download = `${(exam.data?.title ?? result?.preview?.title ?? 'de-thi').replace(/[\\/:*?"<>|]+/g, '-')}.exam`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (exam.data?.gradingMode === 'MANUAL') {
    return <Alert type="info" showIcon title="Bài nhập điểm tay không có đáp án, không soạn bằng ExamDSL." />;
  }

  const status = !result ? (
    <Tag>Đang kiểm tra…</Tag>
  ) : errors ? (
    <Tag color="error">{errors} lỗi</Tag>
  ) : diagnostics.length ? (
    <Tag color="warning">Hợp lệ · {diagnostics.length} cảnh báo</Tag>
  ) : (
    <Tag color="success">Hợp lệ</Tag>
  );

  return (
    <div>
      <PageHeader
        back={creating ? { label: 'Bài kiểm tra', to: RoutePaths.exams } : { label: exam.data?.title ?? 'Bài kiểm tra', to: RoutePaths.examDetail(id) }}
        title={creating ? 'Tạo bài kiểm tra bằng ExamDSL' : 'Soạn đề bằng ExamDSL'}
        tags={
          <>
            {status}
            {dirty && <Tag color="processing">Chưa lưu</Tag>}
          </>
        }
        subtitle={exam.data && `${exam.data.class.name} · số câu, các phần, đáp án, xếp loại và luật duyệt trong một file`}
        actions={
          <>
            {canTemplate && (
              <Checkbox checked={withReport} onChange={(e) => setWithReport(e.target.checked)}>
                Cập nhật cả mẫu bảng điểm
              </Checkbox>
            )}
            <Button icon={<DownloadOutlined />} onClick={download} disabled={source === null}>
              Tải file .exam
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              disabled={!result?.ok || serviceDown || (creating && !classId)}
              onClick={() => void save()}
            >
              {creating ? 'Tạo bài kiểm tra' : 'Lưu vào bài kiểm tra'}
            </Button>
          </>
        }
      />
      {serviceDown && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          title="Chưa gọi được trình biên dịch ExamDSL"
          description="Máy dev: chạy npm run dev (hoặc npm run dsl:dev). Máy trung tâm: kiểm tra container dsl trong Docker Compose."
        />
      )}
      {creating && (
        <Card size="small" style={{ marginBottom: 12 }}>
          <Flex gap={16} wrap align="center">
            <Space>
              <span>Lớp</span>
              <Select
                style={{ width: 220 }}
                showSearch={{ optionFilterProp: 'label' }}
                placeholder="Chọn lớp"
                value={classId}
                onChange={setClassId}
                status={classId ? undefined : 'warning'}
                options={(classes.data ?? []).map((c) => ({ value: c.id, label: c.label }))}
              />
            </Space>
            <Space>
              <span>Ngày kiểm tra</span>
              <DatePicker format="DD/MM/YYYY" allowClear={false} value={examDate} onChange={(d) => d && setExamDate(d)} />
            </Space>
            <Space>
              <span>Loại bài</span>
              <Select
                style={{ width: 200 }}
                allowClear
                placeholder="Chưa chọn (hệ số 1)"
                value={categoryId ?? undefined}
                onChange={(v) => setCategoryId(v ?? null)}
                options={(categories.data ?? []).map((c) => ({ value: c.id, label: `${c.name} · x${c.weight}` }))}
              />
            </Space>
            <span className="muted">Tên bài, số câu, thang điểm và đáp án lấy từ file đề.</span>
          </Flex>
        </Card>
      )}
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={13}>
          <Card size="small" title={<Space><CodeOutlined />Mã nguồn</Space>}>
            {source === null ? (
              <Empty description="Đang tải…" />
            ) : (
              <DslEditor ref={editor} value={source} onChange={setSource} diagnostics={diagnostics} height="calc(100vh - 360px)" />
            )}
            <Problems diagnostics={diagnostics} onPick={(d) => editor.current?.goTo(d)} />
          </Card>
        </Col>
        <Col xs={24} xl={11}>
          <Card size="small">
            <Tabs
              items={[
                { key: 'overview', label: 'Tổng quan', children: <Overview result={result} /> },
                { key: 'keys', label: 'Đáp án', children: <KeyGrid result={result} /> },
                {
                  key: 'simulate',
                  label: 'Mô phỏng duyệt',
                  children: creating ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Tạo bài, chụp và chấm vài bài rồi mới mô phỏng được luật duyệt." />
                  ) : (
                    <Simulate examId={id} source={source} ok={!!result?.ok} />
                  ),
                },
                { key: 'json', label: 'JSON gửi app', children: <JsonView outputs={result?.outputs} /> },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}

function Problems({ diagnostics, onPick }: { diagnostics: DslDiagnostic[]; onPick: (d: DslDiagnostic) => void }) {
  if (diagnostics.length === 0) return <div className="text-success" style={{ marginTop: 8 }}>Không có lỗi</div>;
  return (
    <div style={{ marginTop: 8, maxHeight: 180, overflow: 'auto' }}>
      {diagnostics.map((d, i) => (
        <div key={i} className="dsl-problem" onClick={() => onPick(d)}>
          <Tag color={d.severity === 'error' ? 'error' : 'warning'}>{d.code}</Tag>
          <span className="pos">
            {d.line}:{d.column}
          </span>
          <span>
            {d.message} <span className="muted">· pha {PHASE[d.phase] ?? d.phase}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

const NeedValid = () => <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Sửa hết lỗi để xem phần này" />;

function Overview({ result }: { result: DslCompileResult | null }) {
  const p = result?.preview;
  if (!p) return <NeedValid />;
  return (
    <div>
      <h3 style={{ margin: '0 0 4px' }}>{p.title}</h3>
      <div className="muted">
        Bộ lựa chọn {p.options.split('').join(' ')} · {p.versions.map((v) => v || 'một mã đề chung').join(', ')}
      </div>
      <Flex gap={24} wrap style={{ margin: '12px 0' }}>
        <Statistic title="Số câu" value={p.questions} />
        <Statistic title="Mã đề" value={p.versions.length} />
        <Statistic title="Thang điểm" value={p.max} />
        <Statistic title="Luật duyệt" value={p.rules.length} />
      </Flex>
      {p.sections.length > 0 ? (
        <Table
          size="small"
          pagination={false}
          rowKey="name"
          dataSource={p.sections}
          columns={[
            { title: 'Phần', dataIndex: 'name' },
            { title: 'Loại câu', dataIndex: 'kind', render: (k: string) => (k === 'text' ? 'Điền từ' : 'Trắc nghiệm') },
            { title: 'Số câu', dataIndex: 'questions', align: 'right' },
            { title: 'Điểm/câu', dataIndex: 'perQuestion', align: 'right', render: fmt },
            { title: 'Tổng', dataIndex: 'points', align: 'right', render: fmt },
          ]}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}>
                <b>Cộng</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={1} />
              <Table.Summary.Cell index={2} align="right">
                <b>{p.questions}</b>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={3} />
              <Table.Summary.Cell index={4} align="right">
                <b>{fmt(p.totalPoints)}</b>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          )}
        />
      ) : (
        <div className="muted">Không khai báo phần: chia đều thang điểm cho mọi câu.</div>
      )}
      <h4 style={{ margin: '16px 0 8px' }}>Xếp loại trên bảng điểm (thang 10)</h4>
      <Flex gap={8} wrap>
        {p.bands.map((b, i) => (
          // Màu lấy từ file đề (dữ liệu), không phải màu giao diện
          <Tag key={b.label} style={{ background: b.fill, color: b.font, border: 0, fontWeight: 700, padding: '2px 10px' }}>
            {b.label} {i === p.bands.length - 1 ? '· còn lại' : `≥ ${fmt(b.min)}`}
          </Tag>
        ))}
      </Flex>
      <h4 style={{ margin: '16px 0 8px' }}>Luật duyệt{p.defaultReview ? ' (mặc định, giống app hiện nay)' : ''}</h4>
      {p.rules.map((r, i) => (
        <Card key={i} size="small" className="dsl-rule" style={{ marginBottom: 6 }}>
          <b>{r.message ?? 'Cần duyệt'}</b> <Tag>{r.scope === 'answer' ? 'theo từng câu' : 'theo cả bài'}</Tag>
          <code>{r.when}</code>
        </Card>
      ))}
    </div>
  );
}

function KeyGrid({ result }: { result: DslCompileResult | null }) {
  const keys = result?.outputs?.keys;
  const codes = useMemo(() => Object.keys(keys ?? {}), [keys]);
  const [code, setCode] = useState<string>('');
  if (!keys) return <NeedValid />;
  const current = codes.includes(code) ? code : codes[0];
  return (
    <div>
      {codes.length > 1 && (
        <Segmented
          style={{ marginBottom: 12 }}
          value={current}
          onChange={(v) => setCode(String(v))}
          options={codes.map((c) => ({ value: c, label: `Mã đề ${c}` }))}
        />
      )}
      <div className="dsl-qgrid">
        {keys[current].items.map((it) => (
          <div key={it.q} className={`dsl-q ${it.kind}`}>
            <div className="n">
              <span>Câu {it.q}</span>
              <span>{fmt(it.points)}đ</span>
            </div>
            <div className="a" title={it.correct.join(' / ')}>
              {it.correct.join(it.kind === 'text' ? ' / ' : ' hoặc ')}
            </div>
          </div>
        ))}
      </div>
      <div className="muted" style={{ marginTop: 8 }}>
        Ô vàng là câu điền từ. Điểm từng câu do trình biên dịch tính từ các phần.
      </div>
    </div>
  );
}

function Simulate({ examId, source, ok }: { examId: string; source: string | null; ok: boolean }) {
  const sheets = useQuery({
    queryKey: ['exams', examId, 'dsl', 'sheets'],
    queryFn: () => get<{ submissions: { studentName: string; raw: unknown }[] }>(`/exams/${examId}/dsl/sheets`),
  });
  const [res, setRes] = useState<DslSimulateResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const count = sheets.data?.submissions.length ?? 0;

  const run = async () => {
    if (!source || !sheets.data) return;
    setBusy(true);
    setErr(null);
    try {
      setRes(await dslSimulate(source, sheets.data));
    } catch {
      setErr('Không chạy được mô phỏng. Kiểm tra trình biên dịch ExamDSL đang chạy.');
    } finally {
      setBusy(false);
    }
  };

  if (!ok) return <NeedValid />;
  if (count === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Bài này chưa có bài nào được AI đọc. Chụp và chấm vài bài rồi chạy mô phỏng." />;
  }
  const s = res?.summary;
  return (
    <div>
      <Flex gap={12} align="center" wrap style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlayCircleOutlined />} loading={busy} onClick={() => void run()}>
          Chạy trên {count} bài đã chấm
        </Button>
        <span className="muted">Chấm lại và chạy luật duyệt trong file, không ghi gì vào app.</span>
      </Flex>
      {err && <Alert type="error" showIcon title={err} />}
      {s && res && (
        <>
          <Flex gap={24} wrap style={{ marginBottom: 12 }}>
            <Statistic title="Bài cần duyệt" value={`${s.needsReview}/${s.submissions}`} />
            <Statistic title="Tỉ lệ phải duyệt" value={s.needsReviewPercent} suffix="%" />
            <Statistic title="Điểm trung bình" value={s.averageScore ?? '—'} />
            <Statistic title="Câu không chắc lọt qua" value={s.uncertainNotFlagged} />
          </Flex>
          <Table
            size="small"
            pagination={false}
            rowKey="student"
            dataSource={res.results}
            columns={[
              {
                title: 'Học sinh',
                dataIndex: 'student',
                render: (name: string, r) => {
                  const why = new Map<string, number[]>();
                  for (const f of r.flags) why.set(f.rule, [...(why.get(f.rule) ?? []), ...(f.q ? [f.q] : [])]);
                  return (
                    <>
                      {name}
                      {why.size > 0 && (
                        <div className="muted" style={{ fontSize: 12 }}>
                          {[...why].map(([k, qs]) => k + (qs.length ? ` (câu ${qs.join(', ')})` : '')).join('; ')}
                        </div>
                      )}
                    </>
                  );
                },
              },
              { title: 'Điểm', dataIndex: 'score', align: 'right', render: (v: number | null) => (v === null ? '—' : fmt(v)) },
              { title: 'Xếp loại', dataIndex: 'band', render: (v: string | null) => v ?? '—' },
              {
                title: 'Trạng thái',
                dataIndex: 'status',
                render: (v: string) => (v === 'GRADED' ? <Tag color="success">Đã chấm</Tag> : <Tag color="warning">Cần duyệt</Tag>),
              },
            ]}
          />
        </>
      )}
    </div>
  );
}

function JsonView({ outputs }: { outputs?: DslOutputs }) {
  const [target, setTarget] = useState<keyof DslOutputs>('keys');
  if (!outputs) return <NeedValid />;
  return (
    <div>
      <Select
        style={{ width: '100%', marginBottom: 8 }}
        value={target}
        onChange={setTarget}
        options={[
          { value: 'exam', label: 'Thông tin bài · PATCH /exams/{id}' },
          { value: 'keys', label: 'Đáp án · PUT /exams/{id}/answer-keys/{mã}' },
          { value: 'report', label: 'Mẫu bảng điểm · PUT /report-templates/default' },
          { value: 'review', label: 'Luật duyệt (cây biểu thức)' },
        ]}
      />
      <pre className="dsl-json">{JSON.stringify(outputs[target], null, 2)}</pre>
    </div>
  );
}
