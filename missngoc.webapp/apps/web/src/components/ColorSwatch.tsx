import { ColorPicker } from 'antd';
import type { Color } from 'antd/es/color-picker';

const hex = (c: Color | string) => (typeof c === 'string' ? c : c.toHexString()).toUpperCase().slice(0, 7);

/** Ô chọn màu dạng #RRGGBB, dùng cho mẫu bảng điểm và sổ điểm. `allowClear` cho phép bỏ màu. */
export function ColorSwatch({
  value,
  onChange,
  allowClear,
}: {
  value?: string;
  onChange?: (v: string | undefined) => void;
  allowClear?: boolean;
}) {
  return (
    <ColorPicker
      value={value ?? null}
      allowClear={allowClear}
      onChange={(c) => onChange?.(hex(c))}
      onClear={() => onChange?.(undefined)}
      showText
      disabledAlpha
    />
  );
}
