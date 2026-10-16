import { ArrowLeftOutlined, CameraOutlined, DeleteOutlined, PictureOutlined, SwapOutlined } from '@ant-design/icons';
import { Alert, App, Button, Flex, Modal, Popconfirm, Progress, Select, Space, Spin } from 'antd';
import { useRef, useState, type ChangeEvent } from 'react';
import { del, errorMessage, isNetworkError, post, put, upload } from '../../api/client';
import { useSubmission } from '../../api/queries';
import type { ExamRow, SubmissionRow } from '../../api/types';
import { AuthImage } from '../../components/AuthImage';
import { StatusTag } from '../../components/StatusTag';
import { prepareImage, type PreparedImage } from '../../utils/image';

interface Props {
  exam: ExamRow;
  row: SubmissionRow;
  rows: SubmissionRow[];
  pending: boolean;
  lastSaved: { studentId: string; name: string } | null;
  onBack: () => void;
  onSkip: () => void;
  onAddPage: (studentId: string) => void;
  onUploaded: () => void;
  onQueued: (blob: Blob) => void;
  onChanged: () => void;
}

/** Màn hình chụp cho 1 học sinh: tên hiện to để tránh gắn nhầm (FR-CAP-05) */
export function StudentCapture({ exam, row, rows, pending, lastSaved, onBack, onSkip, onAddPage, onUploaded, onQueued, onChanged }: Props) {
  const { message } = App.useApp();
  const input = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [prepared, setPrepared] = useState<PreparedImage | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [moveImageId, setMoveImageId] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState<string | undefined>();
  const detail = useSubmission(row.submissionId ?? undefined);
  const images = row.imageCount > 0 ? (detail.data?.images ?? []) : [];

  const openCamera = () => input.current?.click();

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPreparing(true);
    try {
      setPrepared(await prepareImage(file));
    } catch {
      message.error('Không đọc được ảnh. Chụp lại giúp mình nhé');
    } finally {
      setPreparing(false);
    }
  };

  const discard = () => {
    if (prepared) URL.revokeObjectURL(prepared.previewUrl);
    setPrepared(null);
  };

  const useImage = async () => {
    if (!prepared) return;
    setUploading(true);
    setProgress(0);
    try {
      await upload(`/exams/${exam.id}/submissions/${row.studentId}/images`, prepared.blob, 'bai.jpg', setProgress);
      message.success(`Đã lưu ảnh cho ${row.fullName}`);
      discard();
      onUploaded();
    } catch (err) {
      if (isNetworkError(err)) {
        const blob = prepared.blob;
        discard();
        onQueued(blob);
      } else {
        message.error(errorMessage(err));
      }
    } finally {
      setUploading(false);
    }
  };

  const toggleAbsent = async () => {
    try {
      await put(`/exams/${exam.id}/submissions/${row.studentId}/absent`, { absent: row.status !== 'ABSENT' });
      onChanged();
      if (row.status !== 'ABSENT') onSkip();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const removeImage = async (imageId: string) => {
    try {
      await del(`/submission-images/${imageId}`);
      message.success('Đã xoá ảnh');
      onChanged();
      void detail.refetch();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const moveImage = async () => {
    if (!moveImageId || !moveTo) return;
    try {
      await post(`/submission-images/${moveImageId}/move`, { studentId: moveTo });
      message.success('Đã chuyển ảnh');
      setMoveImageId(null);
      setMoveTo(undefined);
      onChanged();
      void detail.refetch();
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const busy = row.status === 'QUEUED' || row.status === 'PROCESSING';

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
      {/* Không có capture: chọn ảnh đã chụp sẵn trong thư viện */}
      <input ref={gallery} type="file" accept="image/*" hidden onChange={onFile} />
      <Flex justify="space-between" align="center">
        <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
          Danh sách
        </Button>
        <span className="muted">{exam.title}</span>
      </Flex>

      {lastSaved && (
        <Alert
          type="success"
          showIcon
          style={{ marginTop: 12 }}
          title={`Vừa lưu ảnh cho ${lastSaved.name}`}
          action={
            <Button size="small" onClick={() => onAddPage(lastSaved.studentId)}>
              Thêm trang
            </Button>
          }
        />
      )}

      <div className="capture-name">{row.fullName}</div>
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <span className="muted">{row.studentCode}</span> <StatusTag status={row.status} error={row.lastError} />
        {pending && <span className="muted"> · có ảnh đang chờ tải</span>}
      </div>

      {preparing && <Spin style={{ display: 'block', margin: '24px auto' }} description="Đang xử lý ảnh..." />}

      {prepared ? (
        <div>
          <img src={prepared.previewUrl} alt="Xem trước" style={{ width: '100%', borderRadius: 8, border: '1px solid #ddd' }} />
          {prepared.warnings.map((w) => (
            <Alert key={w} type="warning" showIcon title={w} style={{ marginTop: 8 }} />
          ))}
          {uploading && <Progress percent={progress} style={{ marginTop: 8 }} />}
          <Flex gap={8} style={{ marginTop: 12 }}>
            <Button size="large" block onClick={discard} disabled={uploading}>
              Chụp lại
            </Button>
            <Button size="large" block type="primary" onClick={useImage} loading={uploading}>
              Dùng ảnh này
            </Button>
          </Flex>
          <p className="muted" style={{ textAlign: 'center', marginTop: 8 }}>
            Ảnh của <b>{row.fullName}</b>
          </p>
        </div>
      ) : (
        !preparing && (
          <Space orientation="vertical" style={{ width: '100%' }} size={10}>
            <Button
              type="primary"
              size="large"
              block
              icon={<CameraOutlined />}
              onClick={openCamera}
              disabled={busy || row.status === 'ABSENT'}
              style={{ height: 64, fontSize: 20 }}
            >
              {row.imageCount > 0 ? 'Chụp thêm trang' : 'Chụp bài'}
            </Button>
            <Button block icon={<PictureOutlined />} onClick={() => gallery.current?.click()} disabled={busy || row.status === 'ABSENT'}>
              Chọn ảnh có sẵn
            </Button>
            {busy && <Alert type="info" showIcon title="Bài đang được chấm, chờ chấm xong rồi thêm ảnh" />}
            <Flex gap={8}>
              <Button size="large" block onClick={toggleAbsent} disabled={row.imageCount > 0}>
                {row.status === 'ABSENT' ? 'Bỏ đánh vắng' : 'Vắng'}
              </Button>
              <Button size="large" block onClick={onSkip}>
                Học sinh tiếp theo
              </Button>
            </Flex>
          </Space>
        )
      )}

      {images.length > 0 && !prepared && (
        <div style={{ marginTop: 20 }}>
          <b>Ảnh đã tải ({images.length} trang)</b>
          <Flex gap={12} wrap style={{ marginTop: 8 }}>
            {images.map((img) => (
              <div key={img.id} style={{ textAlign: 'center' }}>
                <AuthImage imageId={img.id} height={160} />
                <div>
                  <span className="muted">Trang {img.pageNo}</span>
                  <Button size="small" type="text" icon={<SwapOutlined />} onClick={() => setMoveImageId(img.id)} disabled={busy} title="Chuyển sang học sinh khác" />
                  <Popconfirm title="Xoá ảnh này?" okText="Xoá" cancelText="Không" onConfirm={() => removeImage(img.id)}>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} disabled={busy} title="Xoá ảnh" />
                  </Popconfirm>
                </div>
              </div>
            ))}
          </Flex>
        </div>
      )}

      <Modal
        open={!!moveImageId}
        title="Gắn nhầm học sinh? Chuyển ảnh sang em khác"
        okText="Chuyển"
        cancelText="Huỷ"
        okButtonProps={{ disabled: !moveTo }}
        onOk={moveImage}
        onCancel={() => setMoveImageId(null)}
      >
        <Select
          style={{ width: '100%' }}
          size="large"
          placeholder="Chọn học sinh đúng"
          value={moveTo}
          onChange={setMoveTo}
          showSearch={{ optionFilterProp: 'label' }}
          options={rows.filter((r) => r.studentId !== row.studentId).map((r) => ({ value: r.studentId, label: r.fullName }))}
        />
      </Modal>
    </div>
  );
}
