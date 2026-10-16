import { DownloadOutlined } from '@ant-design/icons';
import { App, Button, Card, Flex, Progress, Space, Statistic, Table, Tabs, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PMS, RoutePaths } from '@missngoc/core';
import { downloadBlob, errorMessage, saveBlob } from '../../api/client';
import { useReport, useStats } from '../../api/queries';
import type { CellStyle, ReportGrid } from '../../api/types';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useCan } from '../../store';

type GridRow = ReportGrid['rows'][number];

function css(style?: CellStyle): React.CSSProperties | undefined {
  if (!style) return undefined;
  return { background: style.fill, color: style.font, fontWeight: style.bold ? 600 : undefined };
}

/** Bảng điểm trên web vẽ từ cùng lưới với file Excel nên luôn khớp nhau */
export function ReportPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const isMobile = useIsMobile();
  const canReview = useCan(PMS.GRD_USER);
  const report = useReport(id);
  const [tab, setTab] = useState('grid');
  const stats = useStats(id, tab === 'stats');
  const [exporting, setExporting] = useState(false);
  const g = report.data;

  const exportXlsx = async () => {
    setExporting(true);
    try {
      const { blob, fileName } = await downloadBlob(`/exams/${id}/report?format=xlsx`);
      saveBlob(blob, fileName ?? 'bang-diem.xlsx');
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  if (!g) return <Card loading />;

  const columns: ColumnsType<GridRow> = g.columns.map((c, idx) => ({
    title: c.title,
    key: c.key,
    width: c.question ? c.width * 10 : c.width * 9,
    align: c.question || ['stt', 'correctCount', 'score', 'versionCode'].includes(c.key) ? ('center' as const) : undefined,
    fixed: !isMobile && idx < 3 ? ('left' as const) : undefined,
    render: (_: unknown, r: GridRow) => r.cells[c.key]?.value ?? '',
    onCell: (r: GridRow) => ({ style: css(r.cells[c.key]?.style) ?? css(r.style) }),
    onHeaderCell: () => ({ style: { background: g.header.fill, color: g.header.font, fontWeight: 600 } }),
  }));

  const s = g.summary;
  const openRow = (r: GridRow) => {
    if (canReview && r.submissionId && ['GRADED', 'NEEDS_REVIEW'].includes(r.status)) navigate(RoutePaths.submissionReview(id, r.submissionId));
  };

  return (
    <div>
      <Flex justify="space-between" align="flex-start" wrap gap={8} style={{ marginBottom: 12 }}>
        <div>
          <Button type="link" style={{ padding: 0 }} onClick={() => navigate(RoutePaths.examDetail(id))}>
            ← Bài kiểm tra
          </Button>
          <h1 className="page-title">{g.title}</h1>
          <div className="muted">{g.subtitle}</div>
        </div>
        <Button type="primary" icon={<DownloadOutlined />} loading={exporting} onClick={exportXlsx}>
          Xuất Excel
        </Button>
      </Flex>

      <Card size="small" style={{ marginBottom: 12 }}>
        <Flex wrap gap={24}>
          <Statistic title="Đã chấm" value={s.graded} suffix={`/ ${s.total}`} />
          <Statistic title="Điểm trung bình" value={s.average ?? '—'} />
          <Statistic title="Cao nhất" value={s.max ?? '—'} />
          <Statistic title="Thấp nhất" value={s.min ?? '—'} />
          {s.needsReview > 0 && <Statistic title="Cần duyệt" value={s.needsReview} />}
          {s.absent > 0 && <Statistic title="Vắng" value={s.absent} />}
        </Flex>
        {s.needsReview > 0 && <Tag color="gold" style={{ marginTop: 8 }}>Dòng tô vàng là bài chưa duyệt xong, điểm có thể còn đổi</Tag>}
      </Card>

      <Card styles={{ body: { paddingTop: 0 } }}>
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: 'grid',
              label: 'Bảng điểm',
              children: isMobile ? (
                <Space orientation="vertical" style={{ width: '100%' }}>
                  {g.rows.map((r) => (
                    <Card key={r.key} size="small" style={css(r.style)} onClick={() => openRow(r)}>
                      <Flex justify="space-between" align="center">
                        <div>
                          <b>{r.cells.fullName?.value}</b>
                          <div className="muted">
                            {r.cells.correctCount?.value != null ? `Đúng ${r.cells.correctCount.value} câu` : r.cells.note?.value}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ ...css(r.cells.score?.style), fontSize: 20, fontWeight: 700, padding: '0 8px', borderRadius: 6 }}>
                            {r.cells.score?.value ?? '—'}
                          </div>
                          <div className="muted">{r.cells.rank?.value}</div>
                        </div>
                      </Flex>
                    </Card>
                  ))}
                </Space>
              ) : (
                <Table<GridRow>
                  className="report-table"
                  rowKey="key"
                  size="small"
                  bordered
                  pagination={false}
                  dataSource={g.rows}
                  columns={columns}
                  scroll={{ x: 'max-content' }}
                  sticky
                  onRow={(r) => ({ onClick: () => openRow(r), style: { cursor: r.submissionId ? 'pointer' : undefined } })}
                />
              ),
            },
            {
              key: 'stats',
              label: 'Thống kê câu sai',
              children: (
                <>
                  {(stats.data ?? []).map((v) => (
                    <div key={v.versionCode} style={{ marginBottom: 16 }}>
                      {(stats.data?.length ?? 0) > 1 && <h3>{v.versionCode ? `Mã đề ${v.versionCode}` : 'Mã đề chung'} · {v.submissions} bài</h3>}
                      <Table
                        rowKey="q"
                        size="small"
                        loading={stats.isLoading}
                        pagination={false}
                        dataSource={[...v.questions].sort((a, b) => (a.correctRate ?? 1) - (b.correctRate ?? 1))}
                        columns={[
                          { title: 'Câu', dataIndex: 'q', width: 60 },
                          { title: 'Đáp án', dataIndex: 'correct', width: 80, render: (c: string[]) => c.join(', ') },
                          {
                            title: '% đúng',
                            dataIndex: 'correctRate',
                            render: (r: number | null) =>
                              r === null ? '—' : <Progress percent={Math.round(r * 100)} size="small" status={r < 0.5 ? 'exception' : 'normal'} />,
                          },
                          {
                            title: 'Sai nhiều nhất',
                            dataIndex: 'topWrong',
                            render: (t: { choice: string; count: number } | null) => (t ? `${t.choice} (${t.count} bài)` : ''),
                          },
                        ]}
                      />
                    </div>
                  ))}
                  <p className="muted">Sắp xếp từ câu nhiều học sinh sai nhất. Chỉ tính bài đã chấm.</p>
                </>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
