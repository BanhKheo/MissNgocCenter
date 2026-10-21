import { App, DatePicker, Form, Input, InputNumber, Modal, Segmented, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect } from 'react';
import { GRADING_MODE_LABEL, PMS, type GradingMode } from '@missngoc/core';
import { errorMessage, patch, post } from '../../api/client';
import { useCategories, useClassOptions } from '../../api/queries';
import type { ExamRow } from '../../api/types';
import { useCan } from '../../store';

interface Values {
  classId: string;
  title: string;
  examDate: Dayjs;
  gradingMode: GradingMode;
  categoryId?: string | null;
  weight?: number | null;
  questionCount: number;
  options: string;
  maxScore: number;
  layoutHint?: string;
}

export function ExamFormModal({
  open,
  value,
  defaultClassId,
  defaultMode,
  defaultDate,
  onClose,
  onSaved,
}: {
  open: boolean;
  value: ExamRow | null;
  defaultClassId?: string;
  /** Mở từ sổ điểm thì mặc định "Nhập điểm tay" */
  defaultMode?: GradingMode;
  defaultDate?: string;
  onClose: () => void;
  onSaved: (e: ExamRow) => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<Values>();
  const classes = useClassOptions();
  const categories = useCategories();
  // Không có quyền quản lý bài kiểm tra thì chỉ tạo được bài nhập điểm tay
  const canAi = useCan(PMS.EXAM_AD);
  const mode = Form.useWatch('gradingMode', form);
  const categoryId = Form.useWatch('categoryId', form);
  const manual = (value?.gradingMode ?? mode) === 'MANUAL';
  const graded = value ? value.counts.GRADED + value.counts.NEEDS_REVIEW > 0 : false;
  const categoryWeight = (categories.data ?? []).find((c) => c.id === categoryId)?.weight;

  useEffect(() => {
    if (!open) return;
    if (value) {
      form.setFieldsValue({
        classId: value.class.id,
        title: value.title,
        examDate: dayjs(value.examDate),
        gradingMode: value.gradingMode,
        categoryId: value.category?.id ?? null,
        weight: value.weight,
        questionCount: value.questionCount,
        options: value.options,
        maxScore: value.maxScore,
        layoutHint: value.layoutHint ?? undefined,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        classId: defaultClassId,
        examDate: defaultDate ? dayjs(defaultDate) : dayjs(),
        gradingMode: canAi ? (defaultMode ?? 'AI') : 'MANUAL',
        categoryId: null,
        weight: null,
        options: 'ABCD',
        maxScore: 10,
        questionCount: 40,
      });
    }
  }, [open, value, defaultClassId, defaultMode, defaultDate, canAi, form]);

  const submit = async () => {
    const v = await form.validateFields();
    const body = {
      title: v.title,
      examDate: v.examDate.format('YYYY-MM-DD'),
      categoryId: v.categoryId ?? null,
      weight: v.weight ?? null,
      maxScore: v.maxScore,
      ...(manual ? {} : { questionCount: v.questionCount, options: v.options, layoutHint: v.layoutHint || undefined }),
    };
    try {
      const saved = value
        ? await patch<ExamRow>(`/exams/${value.id}`, body)
        : await post<ExamRow>('/exams', { ...body, classId: v.classId, gradingMode: v.gradingMode });
      message.success(value ? 'Đã lưu' : 'Đã tạo bài kiểm tra');
      onSaved(saved);
      onClose();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  return (
    <Modal open={open} title={value ? 'Sửa bài kiểm tra' : 'Tạo bài kiểm tra'} onCancel={onClose} onOk={submit} okText="Lưu" cancelText="Huỷ" destroyOnHidden>
      <Form form={form} layout="vertical" requiredMark="optional">
        <Form.Item name="classId" label="Lớp" rules={[{ required: true, message: 'Chọn lớp' }]}>
          <Select
            disabled={!!value}
            showSearch={{ optionFilterProp: 'label' }}
            placeholder="Chọn lớp"
            options={(classes.data ?? []).map((c) => ({ value: c.id, label: c.label }))}
          />
        </Form.Item>
        <Form.Item
          name="gradingMode"
          label="Cách chấm"
          extra={manual ? 'Giáo viên nhập điểm từng học sinh trong sổ điểm lớp. Dùng cho bài nói, viết, kiểm tra nhỏ.' : undefined}
        >
          <Segmented
            disabled={!!value || !canAi}
            options={(['AI', 'MANUAL'] as const).map((m) => ({ value: m, label: GRADING_MODE_LABEL[m] }))}
          />
        </Form.Item>
        <Form.Item name="title" label="Tên bài" rules={[{ required: true, message: 'Nhập tên bài' }]}>
          <Input maxLength={150} placeholder={manual ? 'Kiểm tra nói Unit 2' : 'Kiểm tra giữa kỳ Unit 1–4'} />
        </Form.Item>
        <Form.Item name="examDate" label="Ngày kiểm tra" rules={[{ required: true }]}>
          <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="categoryId" label="Loại bài" extra="Loại bài quyết định hệ số khi tính điểm trung bình">
          <Select
            allowClear
            placeholder="Chưa chọn loại (hệ số 1)"
            loading={categories.isLoading}
            options={(categories.data ?? []).map((c) => ({ value: c.id, label: `${c.name} · x${c.weight}` }))}
          />
        </Form.Item>
        <Form.Item name="weight" label="Hệ số riêng" extra={`Để trống thì dùng hệ số của loại bài (hiện là x${categoryWeight ?? 1})`}>
          <InputNumber min={0} max={100} step={0.5} placeholder={`x${categoryWeight ?? 1}`} style={{ width: '100%' }} />
        </Form.Item>
        {!manual && (
          <>
            <Form.Item name="questionCount" label="Số câu" rules={[{ required: true }]} extra={graded ? 'Bài đã có kết quả chấm, không đổi được số câu' : undefined}>
              <InputNumber min={1} max={200} disabled={graded} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="options" label="Bộ lựa chọn" rules={[{ required: true }]}>
              <Segmented disabled={graded} options={[{ label: 'A–D', value: 'ABCD' }, { label: 'A–E', value: 'ABCDE' }]} />
            </Form.Item>
          </>
        )}
        <Form.Item name="maxScore" label="Thang điểm" rules={[{ required: true }]}>
          <InputNumber min={1} max={1000} style={{ width: '100%' }} />
        </Form.Item>
        {!manual && (
          <Form.Item name="layoutHint" label="Gợi ý bố cục cho AI" extra="Ví dụ: 40 câu, chia 2 cột, mỗi câu 4 ô A–D; học sinh tô ô tròn">
            <Input.TextArea maxLength={300} autoSize={{ minRows: 2 }} />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
