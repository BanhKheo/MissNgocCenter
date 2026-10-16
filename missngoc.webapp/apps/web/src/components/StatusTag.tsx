import { Tag, Tooltip } from 'antd';
import { SUBMISSION_STATUS_LABEL, type SubmissionStatus } from '@missngoc/core';

const COLORS: Record<SubmissionStatus, string> = {
  NO_IMAGE: 'default',
  UPLOADED: 'blue',
  QUEUED: 'cyan',
  PROCESSING: 'processing',
  NEEDS_REVIEW: 'gold',
  GRADED: 'green',
  FAILED: 'red',
  ABSENT: 'purple',
};

export function StatusTag({ status, error }: { status: SubmissionStatus; error?: string | null }) {
  const tag = <Tag color={COLORS[status]}>{SUBMISSION_STATUS_LABEL[status]}</Tag>;
  return error ? <Tooltip title={error}>{tag}</Tooltip> : tag;
}
