import { CopyOutlined, DownloadOutlined, InboxOutlined, RobotOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, App, Button, Card, Flex, Input, Modal, Space, Table, Tag, Typography, Upload } from 'antd';
import { useState, type ReactNode } from 'react';
import { downloadBlob, errorMessage, get, http, saveBlob } from '../api/client';
import type { ImportPreview, ImportSpecDescription } from '../api/types';
import { copyText } from '../utils/clipboard';

interface Props<E> {
  open: boolean;
  onClose: () => void;
  type: 'students' | 'answer-keys';
  /** classId hoặc examId để điền thông tin vào khung định dạng và prompt */
  specParams: Record<string, string>;
  uploadUrl: string;
  onSaved: (preview: ImportPreview<Record<string, unknown>, E>) => void;
  renderExtra?: (extra: E) => ReactNode;
}

/**
 * Import Excel dùng chung cho mọi chỗ import (FR-IMP-01..08):
 * khung định dạng, file mẫu, prompt chatbot, xem trước, còn lỗi thì không lưu.
 */
export function ImportModal<E = unknown>({ open, onClose, type, specParams, uploadUrl, onSaved, renderExtra }: Props<E>) {
  const { message } = App.useApp();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview<Record<string, unknown>, E> | null>(null);
  const [busy, setBusy] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);

  const spec = useQuery({
    queryKey: ['import-spec', type, specParams],
    queryFn: () => get<ImportSpecDescription>(`/import-specs/${type}`, { params: specParams }),
    enabled: open,
  });

  const reset = () => {
    setFile(null);
    setPreview(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const send = async (f: File, dryRun: boolean) => {
    const form = new FormData();
    form.append('file', f, f.name);
    const res = await http.post<{ data: ImportPreview<Record<string, unknown>, E> }>(uploadUrl, form, {
      params: { dryRun },
      timeout: 120_000,
    });
    return res.data.data;
  };

  const choose = async (f: File) => {
    setFile(f);
    setBusy(true);
    try {
      setPreview(await send(f, true));
    } catch (err) {
      setPreview(null);
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const res = await send(file, false);
      if (res.saved) {
        message.success(`Đã lưu ${res.summary.total} dòng`);
        onSaved(res);
        close();
      } else {
        setPreview(res);
        message.error('File còn lỗi, chưa lưu dòng nào');
      }
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const { blob, fileName } = await downloadBlob(`/import-specs/${type}/template?${new URLSearchParams(specParams)}`);
      saveBlob(blob, fileName ?? 'mau.xlsx');
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const copyPrompt = async () => {
    if (!spec.data) return;
    const ok = await copyText(spec.data.prompt);
    if (ok) message.success('Đã sao chép prompt. Dán vào ChatGPT, Claude hoặc Gemini kèm dữ liệu của bạn');
    else message.warning('Không sao chép tự động được. Hãy bôi đen đoạn prompt rồi sao chép');
  };

  const d = spec.data;
  const rows = preview?.rows ?? [];
  const invalidFirst = [...rows].sort((a, b) => Number(b.errors.length > 0) - Number(a.errors.length > 0) || a.rowNumber - b.rowNumber);

  return (
    <Modal
      open={open}
      onCancel={close}
      title={`Nhập từ Excel: ${d?.title ?? ''}`}
      width={900}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={close}>Đóng</Button>
          <Button type="primary" disabled={!preview?.canSave} loading={busy} onClick={save}>
            Lưu {preview?.canSave ? `${preview.summary.total} dòng` : ''}
          </Button>
        </Space>
      }
    >
      {d && (
        <Card size="small" title="File cần đúng định dạng sau" style={{ marginBottom: 12 }}>
          <Table
            size="small"
            pagination={false}
            rowKey="header"
            dataSource={d.columns}
            scroll={{ x: true }}
            columns={[
              { title: 'Cột', dataIndex: 'header', render: (v: string) => <b>{v}</b> },
              { title: 'Bắt buộc', dataIndex: 'required', render: (v: boolean) => (v ? <Tag color="red">Có</Tag> : 'Không') },
              { title: 'Định dạng', dataIndex: 'format' },
              { title: 'Ví dụ', dataIndex: 'examples', render: (v: [string, string]) => v.filter(Boolean).join(' · ') },
            ]}
          />
          <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            {d.rules.map((r) => (
              <li key={r} className="muted">
                {r}
              </li>
            ))}
          </ul>
          <Flex gap={8} wrap style={{ marginTop: 12 }}>
            <Button icon={<DownloadOutlined />} onClick={downloadTemplate}>
              Tải file mẫu
            </Button>
            <Button icon={<RobotOutlined />} onClick={() => setPromptOpen(true)}>
              Tạo prompt cho chatbot
            </Button>
          </Flex>
        </Card>
      )}

      <Upload.Dragger
        accept=".xlsx,.csv"
        multiple={false}
        showUploadList={false}
        disabled={busy}
        beforeUpload={(f) => {
          void choose(f);
          return false;
        }}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p>{file ? `Đã chọn: ${file.name}. Chọn file khác để kiểm tra lại` : 'Chọn hoặc kéo file .xlsx / .csv vào đây'}</p>
        <p className="muted">Chọn file xong sẽ hiện bản xem trước, chưa lưu gì</p>
      </Upload.Dragger>

      {preview && (
        <div style={{ marginTop: 12 }}>
          <Flex gap={8} wrap style={{ marginBottom: 8 }}>
            <Tag>Tổng {preview.summary.total} dòng</Tag>
            <Tag color="green">Hợp lệ {preview.summary.valid}</Tag>
            {preview.summary.invalid > 0 && <Tag color="red">Lỗi {preview.summary.invalid}</Tag>}
            {preview.summary.create > 0 && type === 'students' && <Tag color="blue">Tạo mới {preview.summary.create}</Tag>}
            {preview.summary.update > 0 && <Tag color="orange">Cập nhật {preview.summary.update}</Tag>}
          </Flex>
          {preview.fileErrors.length > 0 && (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 8 }}
              title="File chưa đúng định dạng"
              description={
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {preview.fileErrors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              }
            />
          )}
          {preview.summary.invalid > 0 && (
            <Alert type="warning" showIcon style={{ marginBottom: 8 }} title="Còn dòng lỗi nên chưa lưu được. Sửa file rồi chọn lại." />
          )}
          {preview.canSave && <Alert type="success" showIcon style={{ marginBottom: 8 }} title="File hợp lệ. Bấm Lưu để lưu." />}
          {preview.extra !== undefined && renderExtra?.(preview.extra)}
          <Table
            size="small"
            rowKey="rowNumber"
            dataSource={invalidFirst}
            pagination={{ pageSize: 50, hideOnSinglePage: true }}
            scroll={{ x: true }}
            rowClassName={(r) => (r.errors.length ? 'row-error' : '')}
            columns={[
              { title: 'Dòng', dataIndex: 'rowNumber', width: 60 },
              ...preview.headers.map((h) => ({
                title: h,
                key: h,
                render: (_: unknown, r: (typeof rows)[number]) => r.values[h],
              })),
              {
                title: 'Lỗi',
                key: 'errors',
                render: (_: unknown, r: (typeof rows)[number]) =>
                  r.errors.length ? (
                    <Typography.Text type="danger">{r.errors.map((e) => `${e.column}: ${e.message}`).join('; ')}</Typography.Text>
                  ) : r.action === 'update' ? (
                    <Tag color="orange">Cập nhật</Tag>
                  ) : null,
              },
            ]}
          />
        </div>
      )}

      <Modal
        open={promptOpen}
        onCancel={() => setPromptOpen(false)}
        title="Lời nhắn cho chatbot"
        width={720}
        footer={
          <Space>
            <Button onClick={() => setPromptOpen(false)}>Đóng</Button>
            <Button type="primary" icon={<CopyOutlined />} onClick={copyPrompt}>
              Sao chép
            </Button>
          </Space>
        }
      >
        <p>
          Dán prompt này vào ChatGPT, Claude hoặc Gemini, dán thêm dữ liệu đang có (danh sách lộn xộn, file khác mẫu, ảnh chụp). Chatbot
          tạo file Excel, bạn tải về rồi chọn file đó ở ô bên dưới. Nếu chatbot chỉ trả về CSV, lưu thành file .csv rồi chọn như file Excel.
        </p>
        {d?.privacyNote && <Alert type="warning" showIcon style={{ marginBottom: 12 }} title={d.privacyNote} />}
        <Input.TextArea value={d?.prompt} readOnly autoSize={{ minRows: 10, maxRows: 22 }} style={{ fontFamily: 'ui-monospace, Consolas, monospace' }} />
      </Modal>
    </Modal>
  );
}
