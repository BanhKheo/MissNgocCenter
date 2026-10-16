import ExcelJS from 'exceljs';
import type { ReportGrid } from './report-grid';
import type { QuestionStatsVersion } from './reports.service';

function argb(hex?: string): string | undefined {
  return hex ? 'FF' + hex.replace('#', '').toUpperCase() : undefined;
}

function solid(hex: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(hex) } };
}

/**
 * Xuất đúng lưới mà web đang hiện. Dải màu điểm dùng conditional formatting và cột Xếp loại là công thức,
 * nên giáo viên sửa điểm trực tiếp trong file thì màu và xếp loại tự đổi theo.
 */
export async function buildReportWorkbook(grid: ReportGrid, stats: QuestionStatsVersion[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MissNgoc Grader';
  const ws = wb.addWorksheet('Bảng điểm');
  const lastCol = grid.columns.length;
  const HEADER_ROW = 4;

  ws.mergeCells(1, 1, 1, Math.min(lastCol, 12));
  ws.getCell(1, 1).value = grid.title;
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  ws.mergeCells(2, 1, 2, Math.min(lastCol, 12));
  ws.getCell(2, 1).value = grid.subtitle;
  ws.getCell(2, 1).font = { italic: true, color: { argb: 'FF595959' } };

  grid.columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width;
    const cell = ws.getCell(HEADER_ROW, i + 1);
    cell.value = c.question ? `Câu ${c.question}` : c.title;
    cell.font = { bold: grid.header.bold ?? true, color: { argb: argb(grid.header.font) } };
    cell.fill = solid(grid.header.fill ?? '#1F4E78');
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true, textRotation: c.question ? 90 : 0 };
    cell.border = { bottom: { style: 'thin' } };
  });
  ws.getRow(HEADER_ROW).height = grid.columns.some((c) => c.question) ? 42 : 22;

  const scoreCol = grid.columns.findIndex((c) => c.key === 'score') + 1;
  const scoreLetter = scoreCol > 0 ? ws.getColumn(scoreCol).letter : null;
  const firstData = HEADER_ROW + 1;
  const bands = [...grid.bands].sort((a, b) => b.min - a.min);
  const factor = grid.maxScore / 10; // dải điểm theo thang 10, quy đổi theo thang của bài

  grid.rows.forEach((row, idx) => {
    const r = firstData + idx;
    grid.columns.forEach((c, i) => {
      const cell = ws.getCell(r, i + 1);
      const data = row.cells[c.key];
      if (c.key === 'rank' && scoreLetter) {
        // Xếp loại là công thức theo ô điểm
        const ref = `${scoreLetter}${r}`;
        let formula = `"${bands[bands.length - 1].label}"`;
        for (let b = bands.length - 2; b >= 0; b--) {
          formula = `IF(${ref}>=${+(bands[b].min * factor).toFixed(4)},"${bands[b].label}",${formula})`;
        }
        cell.value = { formula: `IF(ISNUMBER(${ref}),${formula},"")`, result: data?.value ?? '' } as ExcelJS.CellFormulaValue;
      } else {
        cell.value = data?.value ?? null;
      }
      if (c.question || ['stt', 'versionCode', 'correctCount', 'score'].includes(c.key)) {
        cell.alignment = { horizontal: 'center' };
      }
      if (c.key === 'score') cell.numFmt = '0.00';
      const style = c.key === 'score' ? undefined : (data?.style ?? row.style);
      if (style?.fill) cell.fill = solid(style.fill);
      if (style?.font || style?.bold) cell.font = { color: { argb: argb(style.font) }, bold: style.bold };
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFBFBFBF' } } };
    });
  });

  const lastData = firstData + grid.rows.length - 1;
  if (scoreLetter && grid.rows.length > 0) {
    const ref = `${scoreLetter}${firstData}`;
    ws.addConditionalFormatting({
      ref: `${scoreLetter}${firstData}:${scoreLetter}${lastData}`,
      rules: bands.map((b, i) => {
        const lower = `${ref}>=${+(b.min * factor).toFixed(4)}`;
        const upper = i === 0 ? '' : `,${ref}<${+(bands[i - 1].min * factor).toFixed(4)}`;
        return {
          type: 'expression' as const,
          priority: i + 1,
          formulae: [`AND(ISNUMBER(${ref}),${lower}${upper})`],
          style: {
            fill: { type: 'pattern' as const, pattern: 'solid' as const, bgColor: { argb: argb(b.fill) } },
            font: { color: { argb: argb(b.font) } },
          },
        };
      }),
    });
  }

  const sumRow = lastData + 2;
  const s = grid.summary;
  ws.getCell(sumRow, 1).value =
    `Đã chấm ${s.graded}/${s.total}` +
    (s.average !== null ? ` · Điểm trung bình ${s.average} · Cao nhất ${s.max} · Thấp nhất ${s.min}` : '') +
    (s.needsReview ? ` · ${s.needsReview} bài cần duyệt` : '') +
    (s.absent ? ` · ${s.absent} vắng` : '');
  ws.getCell(sumRow, 1).font = { italic: true };

  ws.views = [{ state: 'frozen', ySplit: HEADER_ROW, xSplit: Math.min(3, lastCol) }];
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };

  // Trang thống kê câu sai (UC-14)
  if (stats.length > 0) {
    const st = wb.addWorksheet('Thống kê câu');
    st.columns = [
      { header: 'Mã đề', key: 'v', width: 8 },
      { header: 'Câu', key: 'q', width: 6 },
      { header: 'Đáp án', key: 'k', width: 14 },
      { header: '% đúng', key: 'p', width: 9 },
      { header: 'Sai nhiều nhất', key: 'w', width: 18 },
      { header: 'Số bài', key: 'n', width: 8 },
    ];
    st.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    st.getRow(1).fill = solid(grid.header.fill ?? '#1F4E78');
    for (const v of stats) {
      for (const q of v.questions) {
        const row = st.addRow({
          v: v.versionCode || 'Chung',
          q: q.q,
          k: q.correct.join(q.kind === 'text' ? ' / ' : ','),
          p: q.correctRate,
          w: q.topWrong ? `${q.topWrong.choice} (${q.topWrong.count})` : '',
          n: q.answered,
        });
        row.getCell('p').numFmt = '0%';
        if (q.correctRate !== null && q.correctRate < 0.5) row.getCell('p').fill = solid('#FFC7CE');
      }
    }
    st.views = [{ state: 'frozen', ySplit: 1 }];
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
