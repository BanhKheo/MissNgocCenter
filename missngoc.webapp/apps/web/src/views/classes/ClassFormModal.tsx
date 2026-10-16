import { App, DatePicker, Form, Input, Modal, Select } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect } from 'react';
import { errorMessage, patch, post } from '../../api/client';
import { useUserOptions } from '../../api/queries';
import type { ClassRow } from '../../api/types';

interface Values {
  name: string;
  level?: string;
  teacherId?: string | null;
  range?: [Dayjs | null, Dayjs | null];
}

export function ClassFormModal({ open, value, onClose, onSaved }: { open: boolean; value: ClassRow | null; onClose: () => void; onSaved: (c: ClassRow) => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<Values>();
  const users = useUserOptions(open);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      name: value?.name,
      level: value?.level ?? undefined,
      teacherId: value?.teacher?.id ?? null,
      range: [value?.startDate ? dayjs(value.startDate) : null, value?.endDate ? dayjs(value.endDate) : null],
    });
    if (!value) form.resetFields();
  }, [open, value, form]);

  const submit = async () => {
    const v = await form.validateFields();
    const body = {
      name: v.name,
      level: v.level || undefined,
      teacherId: v.teacherId ?? null,
      startDate: v.range?.[0]?.format('YYYY-MM-DD'),
      endDate: v.range?.[1]?.format('YYYY-MM-DD'),
    };
    try {
      const saved = value ? await patch<ClassRow>(`/classes/${value.id}`, body) : await post<ClassRow>('/classes', body);
      message.success(value ? 'Đã lưu lớp' : 'Đã tạo lớp');
      onSaved(saved);
      onClose();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  return (
    <Modal open={open} title={value ? 'Sửa lớp' : 'Tạo lớp'} onCancel={onClose} onOk={submit} okText="Lưu" cancelText="Huỷ" destroyOnHidden>
      <Form form={form} layout="vertical" requiredMark="optional">
        <Form.Item name="name" label="Tên lớp" rules={[{ required: true, message: 'Nhập tên lớp' }]}>
          <Input placeholder="Ví dụ: Starters 3A" maxLength={100} />
        </Form.Item>
        <Form.Item name="level" label="Trình độ">
          <Input placeholder="Ví dụ: Starters, Movers, Flyers, IELTS" maxLength={50} />
        </Form.Item>
        <Form.Item name="teacherId" label="Giáo viên đứng lớp" extra="Giáo viên chỉ xem được bảng điểm của lớp mình dạy">
          <Select
            allowClear
            loading={users.isLoading}
            placeholder="Chọn giáo viên"
            showSearch={{ optionFilterProp: 'label' }}
            options={(users.data ?? []).map((u) => ({ value: u.id, label: u.label }))}
          />
        </Form.Item>
        <Form.Item name="range" label="Thời gian khoá học">
          <DatePicker.RangePicker format="DD/MM/YYYY" style={{ width: '100%' }} allowEmpty={[true, true]} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
