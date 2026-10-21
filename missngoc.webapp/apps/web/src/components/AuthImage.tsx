import { Image, Skeleton } from 'antd';
import { useEffect, useState } from 'react';
import { downloadBlob } from '../api/client';

/** Ảnh bài làm chỉ trả qua endpoint có kiểm tra quyền, nên phải tải kèm token rồi hiện từ blob */
export function AuthImage({ imageId, height, preview = true }: { imageId: string; height?: number; preview?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    setUrl(null);
    setFailed(false);
    downloadBlob(`/submission-images/${imageId}/file`)
      .then(({ blob }) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => !revoked && setFailed(true));
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageId]);

  if (failed) return <div className="muted">Không tải được ảnh</div>;
  if (!url) return <Skeleton.Image active style={{ width: height ? (height * 3) / 4 : 120, height: height ?? 160 }} />;
  return (
    <Image
      src={url}
      height={height}
      className="auth-image"
      preview={preview}
    />
  );
}
