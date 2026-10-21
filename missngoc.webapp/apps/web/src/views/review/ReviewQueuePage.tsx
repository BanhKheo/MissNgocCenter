import { Button, Card, Empty, Flex, Result, Space, Spin, Tag } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { RoutePaths } from '@missngoc/core';
import { useExam, useSubmissions } from '../../api/queries';
import { PageHeader } from '../../components/PageHeader';

/** Danh sách bài cần duyệt của một bài kiểm tra */
export function ReviewQueuePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const exam = useExam(id);
  const subs = useSubmissions(id);
  const queue = (subs.data ?? []).filter((s) => s.status === 'NEEDS_REVIEW' && s.submissionId);

  return (
    <div className="page-narrow">
      <PageHeader back={{ label: exam.data?.title ?? 'Bài kiểm tra', to: RoutePaths.examDetail(id) }} title="Bài cần duyệt" />
      {subs.isLoading ? (
        <Spin />
      ) : queue.length === 0 ? (
        <Result status="success" title="Không còn bài nào cần duyệt" extra={<Button onClick={() => navigate(RoutePaths.examReport(id))}>Mở bảng điểm</Button>} />
      ) : (
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Button type="primary" size="large" block onClick={() => navigate(RoutePaths.submissionReview(id, queue[0].submissionId!))}>
            Bắt đầu duyệt ({queue.length} bài)
          </Button>
          {queue.map((s) => (
            <Card key={s.studentId} size="small" hoverable onClick={() => navigate(RoutePaths.submissionReview(id, s.submissionId!))}>
              <Flex justify="space-between" align="center">
                <b>{s.fullName}</b>
                <span>
                  {s.uncertainCount > 0 && <Tag color="gold">{s.uncertainCount} câu không chắc</Tag>}
                  {s.nameMismatch && <Tag color="orange">Tên trên bài khác</Tag>}
                  {!s.versionCode && <Tag>Thiếu mã đề?</Tag>}
                </span>
              </Flex>
            </Card>
          ))}
          {queue.length === 0 && <Empty />}
        </Space>
      )}
    </div>
  );
}
