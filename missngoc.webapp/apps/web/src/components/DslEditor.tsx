import { forwardRef, useImperativeHandle, useMemo, useRef, type KeyboardEvent } from 'react';
import type { DslDiagnostic } from '../api/dsl';

const KEYWORDS = new Set(
  ('exam questions options max versions layout section key choice text weight score report title ' +
    'columns style band else fill font review flag when count and or not in true false none').split(' '),
);
const TOKEN = /(\/\/.*$)|("(?:[^"\\]|\\.)*"?)|(#[0-9A-Fa-f]*)|(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(>=|<=|==|!=|[{}()[\],\-/<>.])/g;
const LINE_HEIGHT = 22;

/** Lớp tô màu của từng ký tự trên một dòng */
function classify(line: string): string[] {
  const cls = new Array<string>(line.length).fill('');
  for (const m of line.matchAll(TOKEN)) {
    const word = m[5];
    const kind = m[1] ? 'c' : m[2] ? 's' : m[3] ? 'h' : m[4] ? 'n' : word ? (KEYWORDS.has(word) ? 'k' : /^[A-E]$/.test(word) ? 'l' : '') : 'o';
    for (let i = m.index; i < m.index + m[0].length; i++) cls[i] = kind ? `dsl-t-${kind}` : '';
  }
  return cls;
}

export interface DslEditorHandle {
  /** Đưa con trỏ tới chỗ lỗi và cuộn tới dòng đó */
  goTo: (d: DslDiagnostic) => void;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  diagnostics: DslDiagnostic[];
  height?: number | string;
}

/**
 * Ô soạn ExamDSL: textarea trong suốt nằm trên lớp tô màu. Lỗi gạch đỏ đúng vị trí, cảnh báo gạch vàng,
 * lề trái có chấm đỏ ở dòng lỗi. Không dùng thư viện editor để giữ bundle nhỏ.
 */
export const DslEditor = forwardRef<DslEditorHandle, Props>(function DslEditor({ value, onChange, diagnostics, height = 560 }, ref) {
  const area = useRef<HTMLTextAreaElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => value.split('\n'), [value]);

  const marks = useMemo(() => {
    const byLine = new Map<number, { from: number; to: number; error: boolean }[]>();
    for (const d of diagnostics) {
      const to = d.end_line === d.line ? d.end_column : (lines[d.line - 1]?.length ?? 0) + 1;
      const list = byLine.get(d.line) ?? [];
      list.push({ from: d.column - 1, to: Math.max(to - 1, d.column), error: d.severity === 'error' });
      byLine.set(d.line, list);
    }
    return byLine;
  }, [diagnostics, lines]);

  // Mỗi dòng là các đoạn chữ liền nhau cùng lớp tô màu. Render bằng phần tử React, không chèn HTML.
  const segments = useMemo(
    () =>
      lines.map((line, i) => {
        const cls = classify(line);
        const err = new Array<string>(line.length).fill('');
        for (const m of marks.get(i + 1) ?? []) {
          for (let c = m.from; c < Math.min(m.to, line.length); c++) err[c] = m.error ? 'dsl-err' : err[c] || 'dsl-warn';
        }
        const out: { text: string; cls: string }[] = [];
        for (let c = 0; c < line.length; c++) {
          const k = `${cls[c]} ${err[c]}`.trim();
          const last = out[out.length - 1];
          if (last && last.cls === k) last.text += line[c];
          else out.push({ text: line[c], cls: k });
        }
        return out;
      }),
    [lines, marks],
  );

  useImperativeHandle(ref, () => ({
    goTo(d) {
      const el = area.current;
      if (!el) return;
      let pos = 0;
      for (let i = 0; i < d.line - 1; i++) pos += lines[i].length + 1;
      el.focus();
      el.setSelectionRange(pos + d.column - 1, pos + (d.end_line === d.line ? d.end_column - 1 : d.column));
      if (scroller.current) scroller.current.scrollTop = Math.max(0, (d.line - 5) * LINE_HEIGHT);
    },
  }));

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const el = e.currentTarget;
    const { selectionStart: s, selectionEnd: t } = el;
    onChange(value.slice(0, s) + '  ' + value.slice(t));
    requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
  };

  const longest = Math.max(...lines.map((l) => l.length));
  return (
    <div className="dsl-editor" ref={scroller} style={{ height }}>
      <div className="dsl-gutter">
        {lines.map((_, i) => {
          const m = marks.get(i + 1);
          const sev = m?.some((x) => x.error) ? 'err' : m ? 'warn' : '';
          return (
            <div key={i} className={sev}>
              {i + 1}
            </div>
          );
        })}
      </div>
      <div className="dsl-code" style={{ minWidth: `calc(${longest}ch + 48px)` }}>
        <pre className="dsl-highlight" aria-hidden="true">
          {segments.map((segs, i) => (
            <div key={i} className="dsl-line">
              {segs.map((s, j) => (s.cls ? <span key={j} className={s.cls}>{s.text}</span> : s.text))}
            </div>
          ))}
        </pre>
        <textarea
          ref={area}
          className="dsl-source"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          wrap="off"
          aria-label="Mã nguồn ExamDSL"
          style={{ height: lines.length * LINE_HEIGHT + 24 }}
        />
      </div>
    </div>
  );
});
