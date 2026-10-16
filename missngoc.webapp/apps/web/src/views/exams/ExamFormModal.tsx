import { App, DatePicker, Form, Input, InputNumber, Modal, Segmented, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect } from 'react';
import { errorMessage, patch, post } from '../../api/client';
import { useClassOptions } from '../../api/queries';
import type { ExamRow } from '../../api/types';

interface Values {
  classId: string;
  title: string;
  examDate: Dayjs;
  questionCount: number;
  options: string;
  maxScore: number;
  layoutHint?: string;
}

export function ExamFormModal({
  open,
  value,
  defaultClassId,
  onClose,
  onSaved,
}: {
  open: boolean;
  value: ExamRow | null;
  defaultClassId?: string;
  onClose: () => void;
  onSaved: (e: ExamRow) => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<Values>();
  const classes = useClassOptions();
  const graded = value ? value.counts.GRADED + value.counts.NEEDS_REVIEW > 0 : false;

  useEffect(() => {
    if (!open) return;
    if (value) {
      form.setFieldsValue({
        classId: value.class.id,
        title: value.title,
        examDate: dayjs(value.examDate),
        questionCount: value.questionCount,
        options: value.options,
        maxScore: value.maxScore,
        layoutHint: value.layoutHint ?? undefined,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ classId: defaultClassId, examDate: dayjs(), options: 'ABCD', maxScore: 10, questionCount: 40 });
    }
  }, [open, value, defaultClassId, form]);

  const submit = async () => {
    const v = await form.validateFields();
    const body = {
      title: v.title,
      examDate: v.examDate.format('YYYY-MM-DD'),
      questionCount: v.questionCount,
      options: v.options,
      maxScore: v.maxScore,
      layoutHint: v.layoutHint || undefined,
    };
    try {
      const saved = value
        ? await patch<ExamRow>(`/exams/${value.id}`, body)
        : await post<ExamRow>('/exams', { ...body, classId: v.classId });
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
        <Form.Item name="title" label="Tên bài" rules={[{ required: true, message: 'Nhập tên bài' }]}>
          <Input maxLength={150} placeholder="Kiểm tra giữa kỳ Unit 1–4" />
        </Form.Item>
        <Form.Item name="examDate" label="Ngày kiểm tra" rules={[{ required: true }]}>
          <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="questionCount" label="Số câu" rules={[{ required: true }]} extra={graded ? 'Bài đã có kết quả chấm, không đổi được số câu' : undefined}>
          <InputNumber min={1} max={200} disabled={graded} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="options" label="Bộ lựa chọn" rules={[{ required: true }]}>
          <Segmented disabled={graded} options={[{ label: 'A–D', value: 'ABCD' }, { label: 'A–E', value: 'ABCDE' }]} />
        </Form.Item>
        <Form.Item name="maxScore" label="Thang điểm" rules={[{ required: true }]}>
          <InputNumber min={1} max={1000} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="layoutHint" label="Gợi ý bố cục cho AI" extra="Ví dụ: 40 câu, chia 2 cột, mỗi câu 4 ô A–D; học sinh tô ô tròn">
          <Input.TextArea maxLength={300} autoSize={{ minRows: 2 }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
