import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Card, Checkbox, Flex, Form, Input, InputNumber, Space, Switch, Table, Tag } from 'antd';
import { useEffect, useState } from 'react';
import { errorMessage, put } from '../../api/client';
import { qk, useApiMutation, useReportTemplate } from '../../api/queries';
import type { ReportTemplateConfig } from '../../api/types';
import { RowAction, SaveButton } from '../../components/buttons';
import { ColorSwatch } from '../../components/ColorSwatch';
import { PageHeader } from '../../components/PageHeader';

const COLUMN_OPTIONS = [
  { value: 'stt', label: 'STT' },
  { value: 'studentCode', label: 'Mã HS' },
  { value: 'fullName', label: 'Họ và tên' },
  { value: 'versionCode', label: 'Mã đề' },
  { value: 'correctCount', label: 'Số câu đúng' },
  { value: 'score', label: 'Điểm' },
  { value: 'rank', label: 'Xếp loại' },
  { value: 'note', label: 'Ghi chú' },
];

function Swatch({ value, onChange }: { value?: string; onChange?: (v: string) => void }) {
  return <ColorSwatch value={value} onChange={(v) => v && onChange?.(v)} />;
}

/** Mẫu bảng điểm (UC-11): màu tiêu đề, dải điểm theo màu, cột hiển thị */
export function ReportTemplatePage() {
  const { message } = App.useApp();
  const tpl = useReportTemplate();
  const [config, setConfig] = useState<ReportTemplateConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const refresh = useApiMutation(async () => undefined, [qk.reportTemplate, ['exams']]);

  useEffect(() => {
    if (tpl.data) setConfig(structuredClone(tpl.data));
  }, [tpl.data]);

  if (!config) return <Card loading />;

  const set = (patch: Partial<ReportTemplateConfig>) => setConfig((c) => (c ? { ...c, ...patch } : c));
  const setBand = (i: number, patch: Partial<ReportTemplateConfig['scoreBands'][number]>) =>
    set({ scoreBands: config.scoreBands.map((b, j) => (j === i ? { ...b, ...patch } : b)) });

  const save = async () => {
    setSaving(true);
    try {
      await put('/report-templates/default', { config: { ...config, scoreBands: [...config.scoreBands].sort((a, b) => b.min - a.min) } });
      message.success('Đã lưu mẫu bảng điểm');
      refresh.mutate(undefined);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 820 }}>
      <PageHeader title="Mẫu bảng điểm" actions={<SaveButton loading={saving} onClick={save} />} />
      <Space orientation="vertical" style={{ width: '100%' }} size={12}>
        <Card size="small" title="Tiêu đề và cột">
          <Form layout="vertical">
            <Form.Item label="Tiêu đề" extra="{className} là tên lớp, {examTitle} là tên bài kiểm tra">
              <Input value={config.title} onChange={(e) => set({ title: e.target.value })} />
            </Form.Item>
            <Form.Item label="Cột hiển thị">
              <Checkbox.Group value={config.columns} options={COLUMN_OPTIONS} onChange={(v) => set({ columns: COLUMN_OPTIONS.map((o) => o.value).filter((k) => v.includes(k)) })} />
            </Form.Item>
            <Flex gap={24} wrap>
              <Form.Item label="Hiện đáp án từng câu">
                <Switch checked={config.showPerQuestion} onChange={(v) => set({ showPerQuestion: v })} />
              </Form.Item>
              <Form.Item label="Nền tiêu đề cột">
                <Swatch value={config.header.fill} onChange={(v) => set({ header: { ...config.header, fill: v } })} />
              </Form.Item>
              <Form.Item label="Chữ tiêu đề cột">
                <Swatch value={config.header.font} onChange={(v) => set({ header: { ...config.header, font: v } })} />
              </Form.Item>
            </Flex>
            <Flex gap={24} wrap>
              <Form.Item label="Ô câu sai">
                <Swatch value={config.wrongCell.fill} onChange={(v) => set({ wrongCell: { ...config.wrongCell, fill: v } })} />
              </Form.Item>
              <Form.Item label="Ô bỏ trống">
                <Swatch value={config.blankCell.fill} onChange={(v) => set({ blankCell: { ...config.blankCell, fill: v } })} />
              </Form.Item>
              <Form.Item label="Dòng cần duyệt">
                <Swatch value={config.needsReviewRow.fill} onChange={(v) => set({ needsReviewRow: { fill: v } })} />
              </Form.Item>
            </Flex>
          </Form>
        </Card>

        <Card
          size="small"
          title="Dải điểm theo màu (thang 10; bài thang khác tự quy đổi)"
          extra={
            <Button size="small" icon={<PlusOutlined />} onClick={() => set({ scoreBands: [...config.scoreBands, { min: 0, label: 'Mới', fill: '#FFFFFF', font: '#000000' }] })}>
              Thêm dải
            </Button>
          }
        >
          <Table
            size="small"
            pagination={false}
            rowKey="key"
            dataSource={config.scoreBands.map((b, i) => ({ ...b, key: i }))}
            columns={[
              { title: 'Từ điểm', key: 'min', render: (_, b, i) => <InputNumber min={0} max={10} step={0.5} value={b.min} onChange={(v) => setBand(i, { min: Number(v ?? 0) })} /> },
              { title: 'Xếp loại', key: 'label', render: (_, b, i) => <Input value={b.label} onChange={(e) => setBand(i, { label: e.target.value })} /> },
              { title: 'Nền', key: 'fill', render: (_, b, i) => <Swatch value={b.fill} onChange={(v) => setBand(i, { fill: v })} /> },
              { title: 'Chữ', key: 'font', render: (_, b, i) => <Swatch value={b.font} onChange={(v) => setBand(i, { font: v })} /> },
              { title: 'Xem', key: 'preview', render: (_, b) => <Tag style={{ background: b.fill, color: b.font, borderColor: b.fill }}>{b.label}</Tag> },
              {
                title: '',
                key: 'del',
                render: (_, __, i) => (
                  <RowAction
                    isRender={config.scoreBands.length > 1}
                    icon={<DeleteOutlined />}
                    label="Xoá dải điểm"
                    danger
                    onClick={() => set({ scoreBands: config.scoreBands.filter((_, j) => j !== i) })}
                  />
                ),
              },
            ]}
          />
        </Card>
      </Space>
    </div>
  );
}
