import { App, DatePicker, Form, Input, Modal } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect } from 'react';
import { errorMessage, patch, post } from '../../api/client';
import type { StudentRow } from '../../api/types';

interface Values {
  studentCode?: string;
  fullName: string;
  dob?: Dayjs | null;
  parentPhone?: string;
}

export function StudentFormModal({
  open,
  classId,
  value,
  onClose,
  onSaved,
}: {
  open: boolean;
  classId: string;
  value: StudentRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<Values>();

  useEffect(() => {
    if (!open) return;
    if (value) {
      form.setFieldsValue({
        studentCode: value.studentCode,
        fullName: value.fullName,
        dob: value.dob ? dayjs(value.dob) : null,
        parentPhone: value.parentPhone ?? undefined,
      });
    } else form.resetFields();
  }, [open, value, form]);

  const submit = async () => {
    const v = await form.validateFields();
    const body = {
      studentCode: v.studentCode?.trim() || undefined,
      fullName: v.fullName,
      dob: v.dob ? v.dob.format('YYYY-MM-DD') : null,
      parentPhone: v.parentPhone?.trim() || null,
    };
    try {
      if (value) await patch(`/students/${value.id}`, body);
      else await post(`/classes/${classId}/students`, body);
      message.success('Đã lưu học sinh');
      onSaved();
      onClose();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  return (
    <Modal open={open} title={value ? 'Sửa học sinh' : 'Thêm học sinh'} onCancel={onClose} onOk={submit} okText="Lưu" cancelText="Huỷ" destroyOnHidden>
      <Form form={form} layout="vertical" requiredMark="optional">
        <Form.Item name="fullName" label="Họ và tên" rules={[{ required: true, message: 'Nhập họ tên' }]}>
          <Input maxLength={100} placeholder="Nguyễn Văn An" />
        </Form.Item>
        <Form.Item name="studentCode" label="Mã HS" extra={value ? undefined : 'Để trống thì hệ thống tự tạo'}>
          <Input maxLength={30} placeholder="HS00001" />
        </Form.Item>
        <Form.Item name="dob" label="Ngày sinh">
          <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="parentPhone" label="SĐT phụ huynh" rules={[{ pattern: /^0\d{9}$/, message: '10 chữ số, bắt đầu bằng 0' }]}>
          <Input inputMode="tel" maxLength={10} placeholder="0912345678" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
