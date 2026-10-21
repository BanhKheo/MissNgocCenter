import { App, Button, Flex, Input, Modal, Select, Space } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_VERSION_URL_PARAM, parseKeyAnswer, splitTextAnswers, type KeyAnswer, type QuestionKind } from '@missngoc/core';
import { errorMessage, put } from '../../api/client';
import type { AnswerKeyGrid, ExamRow } from '../../api/types';

/** Một câu trong lưới: trắc nghiệm giữ các chữ đúng, điền từ giữ nguyên chuỗi đang gõ */
interface Cell {
  kind: QuestionKind;
  correct: string[];
  text: string;
}

const emptyCell = (kind: QuestionKind): Cell => ({ kind, correct: [], text: '' });

const fromAnswer = (a: KeyAnswer): Cell =>
  a.kind === 'text' ? { kind: 'text', correct: [], text: a.correct.join(' / ') } : { kind: 'choice', correct: a.correct, text: '' };

const isFilled = (c: Cell) => (c.kind === 'text' ? splitTextAnswers(c.text).length > 0 : c.correct.length > 0);

/** Đọc chuỗi đáp án dán vào: "1.C 2.D 5. twice 8. eight hours", "1A 2B 3C" hoặc "ABCDA..." */
export function parseKeyString(text: string, count: number, options: string): (KeyAnswer | null)[] {
  const out: (KeyAnswer | null)[] = Array.from({ length: count }, () => null);
  // Số câu có dấu . : ) phía sau thì cắt theo số câu, đọc được cả câu điền từ. Câu ngoài số câu của bài thì bỏ qua.
  const numbered = [...text.matchAll(/(?:^|[\s,;])(\d+)\s*[.:)]/g)];
  if (numbered.length > 0) {
    numbered.forEach((m, i) => {
      const q = Number(m[1]);
      const end = i + 1 < numbered.length ? numbered[i + 1].index : text.length;
      // Đáp án không xuống dòng: cắt ở cuối dòng để không dính chữ của phần sau
      const raw = text.slice(m.index + m[0].length, end).split(/\r?\n/)[0].replace(/[,;]\s*$/, '');
      const parsed = parseKeyAnswer(raw, options);
      if (q >= 1 && q <= count && !('error' in parsed)) out[q - 1] = parsed;
    });
    return out;
  }
  const t = text.toUpperCase();
  const pairs = [...t.matchAll(/(\d+)\s*[.:)\-]?\s*([A-E](?:\s*[,/]\s*[A-E])*)/g)];
  if (pairs.length > 0) {
    for (const m of pairs) {
      const q = Number(m[1]);
      const letters = m[2].split(/[,/\s]+/).filter((l) => options.includes(l));
      if (q >= 1 && q <= count && letters.length) out[q - 1] = { kind: 'choice', correct: letters };
    }
    return out;
  }
  const letters = t.replace(/[^A-E]/g, '').split('');
  letters.slice(0, count).forEach((l, i) => {
    if (options.includes(l)) out[i] = { kind: 'choice', correct: [l] };
  });
  return out;
}

export function AnswerKeyEditor({
  open,
  exam,
  keys,
  onClose,
  onSaved,
}: {
  open: boolean;
  exam: ExamRow;
  keys: AnswerKeyGrid[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { message } = App.useApp();
  const options = exam.options.split('');
  const existingCodes = keys.map((k) => k.versionCode);
  const [version, setVersion] = useState<string>('');
  const [newCode, setNewCode] = useState('');
  const [grid, setGrid] = useState<Cell[]>([]);
  const [paste, setPaste] = useState('');
  const [saving, setSaving] = useState(false);
  const [multi, setMulti] = useState(false);

  const code = version === '__new__' ? newCode.trim().toUpperCase() : version;

  useEffect(() => {
    if (!open) return;
    setVersion(existingCodes[0] ?? '');
    setPaste('');
    setNewCode('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const key = keys.find((k) => k.versionCode === code);
    // Mã đề mới lấy loại câu theo mã đề đã có, vì các mã đề phải cùng loại câu
    const kindOf = (q: number) => keys[0]?.items.find((it) => it.q === q)?.kind ?? 'choice';
    const g = Array.from({ length: exam.questionCount }, (_, i) => {
      const item = key?.items.find((it) => it.q === i + 1);
      return item ? fromAnswer(item) : emptyCell(kindOf(i + 1));
    });
    setGrid(g);
  }, [code, keys, exam.questionCount]);

  const filled = useMemo(() => grid.filter(isFilled).length, [grid]);

  const update = (qi: number, fn: (cur: Cell) => Cell) => setGrid((g) => g.map((cur, i) => (i === qi ? fn(cur) : cur)));

  const toggle = (qi: number, letter: string) =>
    update(qi, (cur) => {
      if (cur.correct.includes(letter)) return { ...cur, correct: cur.correct.filter((l) => l !== letter) };
      // Bình thường bấm chữ khác thì thay chữ cũ; bật "nhiều đáp án đúng" thì cộng thêm (đề lỗi)
      return { ...cur, correct: multi ? [...cur.correct, letter].sort() : [letter] };
    });

  const switchKind = (qi: number) => update(qi, (cur) => emptyCell(cur.kind === 'choice' ? 'text' : 'choice'));

  const applyPaste = () => {
    const parsed = parseKeyString(paste, exam.questionCount, exam.options);
    const n = parsed.filter(Boolean).length;
    if (n === 0) {
      message.warning('Không đọc được đáp án nào. Ví dụ: 1.C 2.D 5. twice, hoặc ABCDABCD...');
      return;
    }
    setGrid((g) => g.map((cur, i) => (parsed[i] ? fromAnswer(parsed[i]) : cur)));
    message.success(`Đã điền ${n} câu`);
  };

  const save = async () => {
    const missing = grid.map((c, i) => (isFilled(c) ? 0 : i + 1)).filter(Boolean);
    if (missing.length) {
      message.error(`Còn thiếu câu: ${missing.slice(0, 15).join(', ')}${missing.length > 15 ? '…' : ''}`);
      return;
    }
    if (version === '__new__' && !/^[A-Z0-9-]{1,10}$/.test(code)) {
      message.error('Mã đề gồm chữ, số, tối đa 10 ký tự');
      return;
    }
    setSaving(true);
    try {
      const res = await put<{ rescored: number; needRegrade: number }>(`/exams/${exam.id}/answer-keys/${code || DEFAULT_VERSION_URL_PARAM}`, {
        items: grid.map((c, i) => ({ q: i + 1, kind: c.kind, correct: c.kind === 'text' ? splitTextAnswers(c.text) : c.correct })),
      });
      if (res.needRegrade) message.warning(`Đã lưu đáp án. Có câu đổi loại nên ${res.needRegrade} bài cần chấm lại: bấm Chấm bài mới`, 8);
      else message.success(res.rescored ? `Đã lưu đáp án và chấm lại ${res.rescored} bài` : 'Đã lưu đáp án');
      onSaved();
      onClose();
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={880}
      title="Nhập đáp án"
      destroyOnHidden
      footer={
        <Space>
          <span className="muted">
            Đã điền {filled}/{exam.questionCount} câu
          </span>
          <Button onClick={onClose}>Huỷ</Button>
          <Button type="primary" loading={saving} onClick={save}>
            Lưu đáp án
          </Button>
        </Space>
      }
    >
      <Flex gap={8} wrap align="center" style={{ marginBottom: 12 }}>
        <span>Mã đề:</span>
        <Select
          style={{ minWidth: 180 }}
          value={version}
          onChange={setVersion}
          options={[
            ...(existingCodes.length === 0 || existingCodes.includes('') ? [{ value: '', label: 'Mã đề chung (1 mã đề)' }] : []),
            ...existingCodes.filter(Boolean).map((c) => ({ value: c, label: `Mã đề ${c}` })),
            { value: '__new__', label: '+ Thêm mã đề mới' },
          ]}
        />
        {version === '__new__' && <Input style={{ width: 140 }} placeholder="Ví dụ 101" value={newCode} onChange={(e) => setNewCode(e.target.value)} maxLength={10} />}
        <Button size="small" type={multi ? 'primary' : 'default'} onClick={() => setMulti((m) => !m)}>
          {multi ? 'Đang cho phép nhiều đáp án đúng' : 'Cho phép nhiều đáp án đúng'}
        </Button>
      </Flex>
      {version === '__new__' && existingCodes.includes('') && (
        <p className="muted">Lưu mã đề riêng sẽ thay thế mã đề chung hiện có.</p>
      )}
      <Flex gap={8} style={{ marginBottom: 4 }}>
        <Input.TextArea
          autoSize={{ minRows: 1, maxRows: 4 }}
          placeholder="Dán nhanh: 1.C 2.D 5. twice 8. eight hours ... hoặc ABCDABCD..."
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
        />
        <Button onClick={applyPaste}>Điền</Button>
      </Flex>
      <p className="muted" style={{ marginTop: 0 }}>
        Chữ cái là câu trắc nghiệm, chữ khác là câu điền từ. Bấm "Điền từ" hoặc "A–D" ở cuối dòng để đổi loại câu. Câu điền từ có
        nhiều cách viết đúng thì ngăn bằng dấu /, ví dụ eight hours / 8 hours. Khi chấm không phân biệt chữ hoa, chữ thường và dấu
        chấm cuối, nhưng sai chính tả là sai.
      </p>
      <div className="key-grid">
        {grid.map((cell, i) => (
          <Flex key={i} align="center" gap={4}>
            <span className={isFilled(cell) ? 'key-no' : 'key-no text-danger'}>{i + 1}.</span>
            {cell.kind === 'choice' ? (
              options.map((l) => (
                <Button key={l} size="small" type={cell.correct.includes(l) ? 'primary' : 'default'} onClick={() => toggle(i, l)} style={{ width: 26, padding: 0 }}>
                  {l}
                </Button>
              ))
            ) : (
              <Input
                size="small"
                placeholder="từ cần điền"
                value={cell.text}
                onChange={(e) => update(i, (cur) => ({ ...cur, text: e.target.value }))}
                style={{ flex: 1, minWidth: 0 }}
              />
            )}
            <Button size="small" type="link" onClick={() => switchKind(i)} style={{ padding: '0 4px', marginLeft: 'auto' }}>
              {cell.kind === 'choice' ? 'Điền từ' : 'A–D'}
            </Button>
          </Flex>
        ))}
      </div>
    </Modal>
  );
}
