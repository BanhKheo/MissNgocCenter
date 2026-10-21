import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Flex, Form, Input, InputNumber, Modal, Space, Switch, Table } from 'antd';
import { useEffect, useState } from 'react';
import { del, errorMessage, patch, post, put } from '../../api/client';
import { qk, useCategories, useGradebookTemplate } from '../../api/queries';
import type { AssessmentCategory, AttendanceCode, GradebookTemplate, HomeworkCode } from '../../api/types';
import { AddButton, RowAction, SaveButton } from '../../components/buttons';
import { ColorSwatch } from '../../components/ColorSwatch';
import { PageHeader } from '../../components/PageHeader';

/** Ô xem trước tiêu đề cột với màu đang chọn */
function HeaderPreview({ label, fill, font }: { label: string; fill?: string; font?: string }) {
  return (
    <span className="gb-preview" style={{ background: fill, color: font }}>
      {label}
    </span>
  );
}

/** Loại bài và hệ số: sửa ngay trên bảng, mỗi thay đổi lưu luôn */
function CategoriesCard() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const categories = useCategories();
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm<{ name: string; weight: number }>();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: qk.categories });
    void queryClient.invalidateQueries({ queryKey: ['classes'] });
    void queryClient.invalidateQueries({ queryKey: ['exams'] });
  };

  const update = async (c: AssessmentCategory, body: Partial<AssessmentCategory>) => {
    try {
      await patch(`/assessment-categories/${c.id}`, body);
      refresh();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const create = async () => {
    const v = await form.validateFields();
    try {
      await post('/assessment-categories', { ...v, sortOrder: (categories.data?.length ?? 0) + 1 });
      setCreateOpen(false);
      form.resetFields();
      refresh();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const remove = (c: AssessmentCategory) =>
    modal.confirm({
      title: `Xoá loại bài "${c.name}"?`,
      content: c.examCount
        ? `${c.examCount} bài kiểm tra đang dùng loại này sẽ chuyển về "chưa chọn loại" (hệ số 1, trừ bài có hệ số riêng).`
        : undefined,
      okText: 'Xoá',
      okButtonProps: { danger: true },
      cancelText: 'Huỷ',
      onOk: async () => {
        try {
          await del(`/assessment-categories/${c.id}`);
          refresh();
        } catch (err) {
          message.error(errorMessage(err));
        }
      },
    });

  return (
    <Card
      size="small"
      title="Loại bài và hệ số"
      extra={<AddButton size="small" text="Thêm loại bài" onClick={() => setCreateOpen(true)} />}
    >
      <p className="hint" style={{ marginTop: 0, marginBottom: 8 }}>
        Điểm trung bình = Σ(hệ số × điểm) / Σ hệ số, chỉ tính các bài có điểm. Mỗi bài kiểm tra chọn một loại; cần thì đặt hệ số riêng cho bài đó.
      </p>
      <Table<AssessmentCategory>
        size="small"
        rowKey="id"
        loading={categories.isLoading}
        dataSource={categories.data}
        pagination={false}
        scroll={{ x: true }}
        columns={[
          {
            title: 'Tên loại bài',
            key: 'name',
            render: (_, c) => <Input key={c.name} defaultValue={c.name} maxLength={60} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== c.name && void update(c, { name: e.target.value.trim() })} />,
          },
          {
            title: 'Hệ số',
            key: 'weight',
            width: 110,
            render: (_, c) => (
              <InputNumber key={c.weight} defaultValue={c.weight} min={0} max={100} step={0.5} prefix="x" style={{ width: 90 }} onBlur={(e) => {
                const v = Number(e.target.value);
                if (!Number.isNaN(v) && v !== c.weight) void update(c, { weight: v });
              }} />
            ),
          },
          { title: 'Nền tiêu đề', key: 'fill', render: (_, c) => <ColorSwatch value={c.headerFill} onChange={(v) => v && void update(c, { headerFill: v })} /> },
          { title: 'Chữ tiêu đề', key: 'font', render: (_, c) => <ColorSwatch value={c.headerFont} onChange={(v) => v && void update(c, { headerFont: v })} /> },
          { title: 'Xem', key: 'preview', render: (_, c) => <HeaderPreview label={`${c.name} x${c.weight}`} fill={c.headerFill} font={c.headerFont} /> },
          { title: 'Thứ tự', key: 'order', width: 90, render: (_, c) => <InputNumber key={c.sortOrder} defaultValue={c.sortOrder} min={0} max={1000} style={{ width: 70 }} onBlur={(e) => {
            const v = Number(e.target.value);
            if (!Number.isNaN(v) && v !== c.sortOrder) void update(c, { sortOrder: v });
          }} /> },
          { title: 'Số bài', dataIndex: 'examCount', width: 70 },
          { title: '', key: 'del', width: 50, render: (_, c) => <RowAction icon={<DeleteOutlined />} label="Xoá loại bài" danger onClick={() => void remove(c)} /> },
        ]}
      />
      <Modal open={createOpen} title="Thêm loại bài" okText="Thêm" cancelText="Huỷ" onOk={create} onCancel={() => setCreateOpen(false)} destroyOnHidden>
        <Form form={form} layout="vertical" requiredMark="optional" initialValues={{ weight: 1 }}>
          <Form.Item name="name" label="Tên loại bài" rules={[{ required: true, message: 'Nhập tên' }]}>
            <Input maxLength={60} placeholder="Ví dụ: Kiểm tra nói" />
          </Form.Item>
          <Form.Item name="weight" label="Hệ số" rules={[{ required: true }]}>
            <InputNumber min={0} max={100} step={0.5} prefix="x" style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}

/** Bảng mã (điểm danh hoặc bài tập): mã, ý nghĩa, màu ô */
function CodesTable<T extends AttendanceCode | HomeworkCode>({
  value,
  onChange,
  withPresent,
  makeNew,
}: {
  value: T[];
  onChange: (v: T[]) => void;
  withPresent?: boolean;
  makeNew: () => T;
}) {
  const set = (i: number, patchValue: Partial<T>) => onChange(value.map((c, j) => (j === i ? { ...c, ...patchValue } : c)));
  return (
    <>
      <Table<T & { idx: number }>
        size="small"
        rowKey="idx"
        pagination={false}
        scroll={{ x: true }}
        dataSource={value.map((c, idx) => ({ ...c, idx }))}
        columns={[
          { title: 'Mã', key: 'code', width: 80, render: (_, c) => <Input value={c.code} maxLength={4} onChange={(e) => set(c.idx, { code: e.target.value.toUpperCase().trim() } as Partial<T>)} /> },
          { title: 'Ý nghĩa', key: 'label', render: (_, c) => <Input value={c.label} maxLength={40} onChange={(e) => set(c.idx, { label: e.target.value } as Partial<T>)} /> },
          ...(withPresent
            ? [
                {
                  title: 'Tính có mặt',
                  key: 'present',
                  width: 100,
                  render: (_: unknown, c: T & { idx: number }) => (
                    <Switch checked={(c as AttendanceCode).present} onChange={(v) => set(c.idx, { present: v } as unknown as Partial<T>)} />
                  ),
                },
              ]
            : []),
          { title: 'Nền ô', key: 'fill', render: (_, c) => <ColorSwatch allowClear value={c.fill} onChange={(v) => set(c.idx, { fill: v } as Partial<T>)} /> },
          { title: 'Chữ', key: 'font', render: (_, c) => <ColorSwatch allowClear value={c.font} onChange={(v) => set(c.idx, { font: v } as Partial<T>)} /> },
          { title: 'Xem', key: 'preview', width: 60, render: (_, c) => <HeaderPreview label={c.code || '?'} fill={c.fill} font={c.font} /> },
          {
            title: '',
            key: 'del',
            width: 50,
            render: (_, c) => <RowAction isRender={value.length > 1} icon={<DeleteOutlined />} label="Xoá mã" danger onClick={() => onChange(value.filter((_, j) => j !== c.idx))} />,
          },
        ]}
      />
      <Button size="small" icon={<PlusOutlined />} style={{ marginTop: 8 }} onClick={() => onChange([...value, makeNew()])}>
        Thêm mã
      </Button>
    </>
  );
}

/** Quản trị sổ điểm: loại bài và hệ số, màu sổ điểm, mã điểm danh và bài tập */
export function GradebookSettingsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const tpl = useGradebookTemplate();
  const [config, setConfig] = useState<GradebookTemplate | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (tpl.data) setConfig(structuredClone(tpl.data));
  }, [tpl.data]);

  const set = (p: Partial<GradebookTemplate>) => setConfig((c) => (c ? { ...c, ...p } : c));

  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await put('/gradebook-template', { config });
      message.success('Đã lưu mẫu sổ điểm');
      void queryClient.invalidateQueries({ queryKey: qk.gradebookTemplate });
      void queryClient.invalidateQueries({ queryKey: ['classes'] });
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const headerRow = (label: string, key: 'header' | 'sessionHeader' | 'homeworkHeader' | 'scoreHeader', sample: string) =>
    config && (
      <Flex gap={16} wrap align="center" className="row-divider">
        <span style={{ minWidth: 200 }}>{label}</span>
        <Space>
          Nền <ColorSwatch value={config[key].fill} onChange={(v) => v && set({ [key]: { ...config[key], fill: v } })} />
        </Space>
        <Space>
          Chữ <ColorSwatch value={config[key].font} onChange={(v) => v && set({ [key]: { ...config[key], font: v } })} />
        </Space>
        <HeaderPreview label={sample} fill={config[key].fill} font={config[key].font} />
      </Flex>
    );

  return (
    <div style={{ maxWidth: 960 }}>
      <PageHeader
        title="Sổ điểm và hệ số"
        subtitle="Cấu hình chung cho sổ điểm mọi lớp: loại bài, hệ số, màu sắc, mã điểm danh và bài tập."
        actions={<SaveButton text="Lưu mẫu sổ điểm" loading={saving} disabled={!config} onClick={save} />}
      />
      <Space orientation="vertical" style={{ width: '100%' }} size={12}>
        <CategoriesCard />

        {!config ? (
          <Card loading />
        ) : (
          <>
            <Card size="small" title="Tiêu đề và màu sổ điểm">
              <Form layout="vertical">
                <Form.Item label="Tiêu đề" extra="{className} là tên lớp">
                  <Input value={config.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} />
                </Form.Item>
              </Form>
              {headerRow('Cột STT, họ tên, điểm TB, xếp hạng', 'header', 'Điểm trung bình')}
              {headerRow('Cột điểm danh từng buổi', 'sessionHeader', 'B3 · T7 10/10')}
              {headerRow('Cột bài tập về nhà', 'homeworkHeader', 'D/ND')}
              {headerRow('Cột điểm bài chưa chọn loại', 'scoreHeader', 'Điểm · CN 11/10')}
              <Flex gap={16} wrap align="center" className="row-divider">
                <span style={{ minWidth: 200 }}>Nền ô điểm</span>
                <ColorSwatch value={config.scoreColumnFill} onChange={(v) => v && set({ scoreColumnFill: v })} />
              </Flex>
              <Flex gap={16} wrap align="center" className="row-divider">
                <span style={{ minWidth: 200 }}>Tô màu điểm dưới</span>
                <InputNumber min={0} max={10} step={0.5} value={config.lowScore.below} onChange={(v) => set({ lowScore: { ...config.lowScore, below: Number(v ?? 0) } })} addonAfter="/ 10" style={{ width: 130 }} />
                <Space>
                  Nền <ColorSwatch value={config.lowScore.fill} onChange={(v) => v && set({ lowScore: { ...config.lowScore, fill: v } })} />
                </Space>
                <Space>
                  Chữ <ColorSwatch value={config.lowScore.font} onChange={(v) => v && set({ lowScore: { ...config.lowScore, font: v } })} />
                </Space>
                <HeaderPreview label="4,3" fill={config.lowScore.fill} font={config.lowScore.font} />
              </Flex>
              <Flex gap={24} wrap align="center" className="row-divider">
                <Space>
                  <Switch checked={config.highlightLowAverage} onChange={(v) => set({ highlightLowAverage: v })} /> Tô màu cả điểm trung bình thấp
                </Space>
                <Space>
                  <Switch checked={config.showStudentCode} onChange={(v) => set({ showStudentCode: v })} /> Hiện cột mã học sinh
                </Space>
                <Space>
                  Điểm trung bình làm tròn
                  <InputNumber min={0} max={2} value={config.averageDecimals} onChange={(v) => set({ averageDecimals: Number(v ?? 1) })} style={{ width: 60 }} />
                  chữ số thập phân
                </Space>
              </Flex>
            </Card>

            <Card size="small" title="Mã điểm danh">
              <CodesTable<AttendanceCode>
                withPresent
                value={config.attendanceCodes}
                onChange={(v) => set({ attendanceCodes: v })}
                makeNew={() => ({ code: '', label: '', present: false })}
              />
              <p className="hint">"Tính có mặt" quyết định cột Tổng buổi. Ví dụ học bù vẫn tính là có mặt.</p>
            </Card>

            <Card size="small" title="Mã bài tập về nhà">
              <CodesTable<HomeworkCode> value={config.homeworkCodes} onChange={(v) => set({ homeworkCodes: v })} makeNew={() => ({ code: '', label: '' })} />
            </Card>
          </>
        )}
      </Space>
    </div>
  );
}
