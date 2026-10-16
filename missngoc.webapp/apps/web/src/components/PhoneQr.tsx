import { QrcodeOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { FloatButton, Popover, QRCode, Select, Spin, Typography } from 'antd';
import { useState } from 'react';
import { get } from '../api/client';
import { useIsMobile } from '../hooks/useIsMobile';

interface ServerInfo {
  publicUrl: string | null;
  addresses: { name: string; address: string }[];
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]'];

/**
 * Nút ở góc dưới phải: hiện mã QR để điện thoại cùng Wi-Fi quét và mở web.
 * Mở web bằng localhost thì điện thoại không dùng được, nên lấy IP mạng LAN từ máy chủ.
 */
export function PhoneQr() {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const isLocal = LOCAL_HOSTS.includes(location.hostname);
  const info = useQuery({
    queryKey: ['server-info'],
    queryFn: () => get<ServerInfo>('/server-info'),
    enabled: open && isLocal,
    staleTime: 60_000,
  });

  if (isMobile) return null;

  const port = location.port ? `:${location.port}` : '';
  const candidates = !isLocal
    ? [location.origin]
    : info.data?.publicUrl
      ? [info.data.publicUrl]
      : (info.data?.addresses ?? []).map((a) => `${location.protocol}//${a.address}${port}`);
  const url = picked && candidates.includes(picked) ? picked : candidates[0];

  const content = (
    <div style={{ width: 220, textAlign: 'center' }}>
      {isLocal && info.isLoading ? (
        <Spin />
      ) : url ? (
        <>
          <QRCode value={url} size={200} bordered={false} style={{ margin: '0 auto' }} />
          <Typography.Text copyable style={{ display: 'block', marginTop: 4 }}>
            {url}
          </Typography.Text>
          {candidates.length > 1 && (
            <Select
              size="small"
              style={{ width: '100%', marginTop: 6 }}
              value={url}
              onChange={setPicked}
              options={candidates.map((c) => ({ value: c, label: c }))}
            />
          )}
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
            Điện thoại dùng cùng Wi-Fi với máy này, mở camera và quét mã.
          </p>
        </>
      ) : (
        <span className="muted">Không tìm thấy địa chỉ mạng LAN của máy chủ</span>
      )}
    </div>
  );

  return (
    <Popover content={content} title="Mở trên điện thoại" trigger="click" placement="topRight" open={open} onOpenChange={setOpen}>
      <FloatButton icon={<QrcodeOutlined />} tooltip={open ? undefined : 'Mở trên điện thoại'} type={open ? 'primary' : 'default'} />
    </Popover>
  );
}
