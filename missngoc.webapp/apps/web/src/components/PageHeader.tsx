import { ArrowLeftOutlined } from '@ant-design/icons';
import { Button, Flex, Space } from 'antd';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

interface Props {
  title: ReactNode;
  /** Link quay lại trang cha, hiện phía trên tiêu đề */
  back?: { label: ReactNode; to: string };
  /** Nhãn trạng thái cạnh tiêu đề (ví dụ "Đã lưu trữ") */
  tags?: ReactNode;
  /** Dòng phụ dưới tiêu đề */
  subtitle?: ReactNode;
  /** Nút hành động bên phải */
  actions?: ReactNode;
}

/** Đầu trang dùng chung: quay lại, tiêu đề, dòng phụ, nút hành động. Trang không tự dựng h1 + flex. */
export function PageHeader({ title, back, tags, subtitle, actions }: Props) {
  const navigate = useNavigate();
  return (
    <Flex className="page-header" justify="space-between" align="flex-start" wrap gap={8}>
      <div className="page-header-main">
        {back && (
          <Button type="link" className="page-back" icon={<ArrowLeftOutlined />} onClick={() => navigate(back.to)}>
            {back.label}
          </Button>
        )}
        <h1 className="page-title">
          {title}
          {tags && <span className="page-title-tags">{tags}</span>}
        </h1>
        {subtitle && <div className="muted">{subtitle}</div>}
      </div>
      {actions && <Space wrap>{actions}</Space>}
    </Flex>
  );
}
