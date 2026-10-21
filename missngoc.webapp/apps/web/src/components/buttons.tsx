import { DownloadOutlined, EditOutlined, FileExcelOutlined, InboxOutlined, PlusOutlined, UndoOutlined } from '@ant-design/icons';
import { Button, type ButtonProps, Popconfirm, Tooltip } from 'antd';
import type { ReactNode } from 'react';

/**
 * Nút dùng chung: mỗi loại hành động có sẵn nhãn, icon và kiểu, để mọi trang trông giống nhau.
 * `isRender={false}` bỏ nút khỏi trang (không có quyền, không áp dụng); `disabled` khi nút có nhưng tạm khoá.
 */
export type PresetButtonProps = Omit<ButtonProps, 'children'> & { text?: ReactNode; isRender?: boolean };

function preset(defaults: ButtonProps, defaultText?: ReactNode) {
  return function PresetButton({ text, isRender = true, ...rest }: PresetButtonProps) {
    if (!isRender) return null;
    return (
      <Button {...defaults} {...rest}>
        {text ?? defaultText}
      </Button>
    );
  };
}

/** Tạo mới. Luôn truyền `text` nói rõ tạo gì, ví dụ "Tạo lớp" */
export const AddButton = preset({ type: 'primary', icon: <PlusOutlined /> }, 'Thêm');
export const EditButton = preset({ icon: <EditOutlined /> }, 'Sửa');
export const SaveButton = preset({ type: 'primary' }, 'Lưu');
export const ImportExcelButton = preset({ icon: <FileExcelOutlined /> }, 'Nhập từ Excel');
export const ExportExcelButton = preset({ type: 'primary', icon: <DownloadOutlined /> }, 'Xuất Excel');

/** Lưu trữ / mở lại, luôn hỏi lại trước khi đổi */
export function ArchiveButton({
  archived,
  confirmTitle,
  onConfirm,
  isRender = true,
}: {
  archived: boolean;
  confirmTitle: { archive: string; restore: string };
  onConfirm: () => void | Promise<void>;
  isRender?: boolean;
}) {
  if (!isRender) return null;
  return (
    <Popconfirm title={archived ? confirmTitle.restore : confirmTitle.archive} okText="Đồng ý" cancelText="Huỷ" onConfirm={onConfirm}>
      <Button icon={archived ? <UndoOutlined /> : <InboxOutlined />}>{archived ? 'Mở lại' : 'Lưu trữ'}</Button>
    </Popconfirm>
  );
}

/**
 * Nút chỉ có icon trong dòng bảng hoặc thẻ. `label` hiện khi rê chuột và đọc cho trình đọc màn hình.
 * Có `confirm` thì hỏi lại trước khi chạy `onClick`.
 */
export function RowAction({
  icon,
  label,
  onClick,
  danger,
  disabled,
  confirm,
  isRender = true,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void | Promise<void>;
  danger?: boolean;
  disabled?: boolean;
  confirm?: { title: string; description?: string; okText?: string };
  isRender?: boolean;
}) {
  if (!isRender) return null;
  const button = (
    <Button size="small" type="text" danger={danger} icon={icon} disabled={disabled} aria-label={label} onClick={confirm ? undefined : onClick} />
  );
  return (
    <Tooltip title={label}>
      {confirm ? (
        <Popconfirm
          title={confirm.title}
          description={confirm.description}
          okText={confirm.okText ?? 'Đồng ý'}
          okButtonProps={{ danger }}
          cancelText="Huỷ"
          onConfirm={onClick}
          disabled={disabled}
        >
          {button}
        </Popconfirm>
      ) : (
        button
      )}
    </Tooltip>
  );
}
