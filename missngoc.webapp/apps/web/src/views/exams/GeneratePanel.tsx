import { RedoOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Flex, Progress, Tooltip } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { errorMessage, get, post } from '../../api/client';
import { qk, useLatestRun } from '../../api/queries';
import type { ExamRow, GradingRunProgress } from '../../api/types';

/** Generate: chấm hàng loạt, hiện tiến độ; giao diện hỏi tiến độ mỗi 2 giây (UC-07) */
export function GeneratePanel({ exam, canGenerate }: { exam: ExamRow; canGenerate: boolean }) {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const latest = useLatestRun(exam.id);
  const [run, setRun] = useState<GradingRunProgress | null>(null);
  const [starting, setStarting] = useState<'new' | 'regrade' | null>(null);
  const wasRunning = useRef(false);

  useEffect(() => {
    if (latest.data) setRun(latest.data);
  }, [latest.data]);

  useEffect(() => {
    if (!run || run.finished) return;
    wasRunning.current = true;
    const t = window.setInterval(async () => {
      try {
        const p = await get<GradingRunProgress>(`/exams/${exam.id}/grading-runs/${run.id}`);
        setRun(p);
        void queryClient.invalidateQueries({ queryKey: qk.submissions(exam.id) });
      } catch {
        // mạng chập chờn: lần sau hỏi lại
      }
    }, 2000);
    return () => window.clearInterval(t);
  }, [run, exam.id, queryClient]);

  useEffect(() => {
    if (run?.finished && wasRunning.current) {
      wasRunning.current = false;
      void queryClient.invalidateQueries({ queryKey: qk.exam(exam.id) });
      void queryClient.invalidateQueries({ queryKey: qk.submissions(exam.id) });
      void queryClient.invalidateQueries({ queryKey: qk.report(exam.id) });
    }
  }, [run?.finished, exam.id, queryClient]);

  const begin = async (regrade: boolean) => {
    setStarting(regrade ? 'regrade' : 'new');
    try {
      const p = await post<GradingRunProgress>(`/exams/${exam.id}/grading-runs`, { regrade });
      setRun(p);
      message.success(`Đã đưa ${p.total} bài vào hàng đợi chấm`);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setStarting(null);
    }
  };

  const confirmRegrade = () =>
    modal.confirm({
      title: `Chấm lại ${allCount} bài?`,
      content: 'AI sẽ đọc lại mọi bài có ảnh. Các câu đã sửa khi duyệt sẽ bị thay bằng kết quả mới.',
      okText: 'Chấm lại',
      okButtonProps: { danger: true },
      cancelText: 'Huỷ',
      onOk: () => begin(true),
    });

  const running = !!run && !run.finished;
  const c = run?.counts ?? {};
  // Khớp với điều kiện chọn bài ở API: bài mới = có ảnh chưa chấm hoặc lỗi lần trước
  const newCount = exam.counts.UPLOADED + exam.counts.FAILED;
  const gradedCount = exam.counts.GRADED + exam.counts.NEEDS_REVIEW;
  const allCount = newCount + gradedCount;

  return (
    <div>
      {canGenerate && (
        <Flex gap={8} wrap>
          <Tooltip title={newCount === 0 && !running ? 'Không có bài mới cần chấm' : undefined}>
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              loading={starting === 'new'}
              disabled={running || newCount === 0 || starting !== null}
              onClick={() => begin(false)}
            >
              {newCount > 0 ? `Chấm ${newCount} bài mới` : 'Chấm bài mới'}
            </Button>
          </Tooltip>
          {gradedCount > 0 && (
            <Button
              icon={<RedoOutlined />}
              loading={starting === 'regrade'}
              disabled={running || starting !== null}
              onClick={confirmRegrade}
            >
              Chấm lại tất cả
            </Button>
          )}
        </Flex>
      )}
      {run && (
        <div style={{ marginTop: 12 }}>
          {running ? (
            <>
              <div>
                Đang chấm {run.done}/{run.total} bài…
              </div>
              <Progress percent={run.total ? Math.round((run.done / run.total) * 100) : 0} status="active" />
            </>
          ) : (
            <Alert
              type={(c.FAILED ?? 0) > 0 ? 'warning' : 'success'}
              showIcon
              title={`Lượt chấm gần nhất: ${run.total} bài, ${c.GRADED ?? 0} đã chấm${c.NEEDS_REVIEW ? `, ${c.NEEDS_REVIEW} cần duyệt` : ''}${c.FAILED ? `, ${c.FAILED} lỗi` : ''}`}
            />
          )}
        </div>
      )}
    </div>
  );
}
