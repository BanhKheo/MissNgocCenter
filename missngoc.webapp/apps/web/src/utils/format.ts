import dayjs from 'dayjs';

type DateInput = string | Date | null | undefined;

/** Ngày hiển thị cho người dùng: dd/MM/yyyy. Rỗng hoặc sai định dạng trả về '' */
export function formatDate(v: DateInput): string {
  if (!v) return '';
  const d = dayjs(v);
  return d.isValid() ? d.format('DD/MM/YYYY') : '';
}

/** Ngày giờ hiển thị cho người dùng: dd/MM/yyyy HH:mm */
export function formatDateTime(v: DateInput, withSeconds = false): string {
  if (!v) return '';
  const d = dayjs(v);
  return d.isValid() ? d.format(withSeconds ? 'DD/MM/YYYY HH:mm:ss' : 'DD/MM/YYYY HH:mm') : '';
}

/** Khoảng ngày "dd/MM/yyyy – dd/MM/yyyy"; thiếu đầu nào thì hiện "—" */
export function formatDateRange(from: DateInput, to: DateInput): string {
  if (!from && !to) return '';
  return `${formatDate(from) || '—'} – ${formatDate(to) || '—'}`;
}
