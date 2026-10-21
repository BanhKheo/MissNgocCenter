import ExcelJS from 'exceljs';
import type { Gradebook } from './gradebook-grid';

function argb(hex?: string): string | undefined {
  return hex ? 'FF' + hex.replace('#', '').toUpperCase() : undefined;
}

function solid(hex: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(hex) } };
}

const thin: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFBFBFBF' } };

/**
 * Xuất sổ điểm giống lưới trên web. Điểm trung bình, xếp hạng, tổng buổi là công thức,
 * điểm dưới ngưỡng tô màu bằng conditional formatting: sửa điểm trong file thì mọi thứ tự tính lại.
 */
export async function buildGradebookWorkbook(g: Gradebook): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MissNgoc Grader';
  const ws = wb.addWorksheet('Sổ điểm');
  const HEADER_ROW = 4;
  const firstData = HEADER_ROW + 1;
  const lastData = firstData + g.rows.length - 1;
  const lastCol = g.columns.length;

  ws.mergeCells(1, 1, 1, Math.min(lastCol, 14));
  ws.getCell(1, 1).value = g.title;
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  ws.mergeCells(2, 1, 2, Math.min(lastCol, 14));
  ws.getCell(2, 1).value = g.subtitle;
  ws.getCell(2, 1).font = { italic: true, color: { argb: 'FF595959' } };

  const letter = (key: string) => ws.getColumn(g.columns.findIndex((c) => c.key === key) + 1).letter;

  g.columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width;
    const cell = ws.getCell(HEADER_ROW, i + 1);
    cell.value = c.subtitle ? `${c.title}\n${c.subtitle}` : c.title;
    cell.font = { bold: true, color: { argb: argb(c.header.font) } };
    cell.fill = solid(c.header.fill);
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { top: thin, left: thin, bottom: thin, right: thin };
  });
  ws.getRow(HEADER_ROW).height = 48;

  const scoreCols = g.columns.filter((c) => c.kind === 'score');
  const attCols = g.columns.filter((c) => c.kind === 'attendance');
  const presentCodes = g.attendanceCodes.filter((c) => c.present).map((c) => c.code);
  const avgLetter = letter('average');

  g.rows.forEach((row, idx) => {
    const r = firstData + idx;
    g.columns.forEach((c, i) => {
      const cell = ws.getCell(r, i + 1);
      const data = row.cells[c.key];
      if (c.kind === 'average' && scoreCols.length > 0) {
        // Σ(hệ số × điểm thang 10) / Σ hệ số của các bài có điểm; ô "V" (vắng) hay ô trống không tính
        const parts = scoreCols.map((sc) => ({ ref: `${letter(sc.key)}${r}`, w: sc.weight ?? 1, max: sc.maxScore ?? 10 }));
        const num = parts.map((p) => `IF(ISNUMBER(${p.ref}),${p.w}*${p.ref}*10/${p.max},0)`).join('+');
        const den = parts.map((p) => `IF(ISNUMBER(${p.ref}),${p.w},0)`).join('+');
        cell.value = {
          formula: `IFERROR(ROUND((${num})/(${den}),${g.averageDecimals}),"")`,
          result: data?.value ?? '',
        } as ExcelJS.CellFormulaValue;
      } else if (c.kind === 'rank' && row.inClass && g.rows.length > 0) {
        const ref = `${avgLetter}${r}`;
        cell.value = {
          formula: `IF(ISNUMBER(${ref}),RANK(${ref},$${avgLetter}$${firstData}:$${avgLetter}$${lastData}),"")`,
          result: data?.value ?? '',
        } as ExcelJS.CellFormulaValue;
      } else if (c.kind === 'total' && attCols.length > 0 && presentCodes.length > 0) {
        const terms = attCols.flatMap((ac) => presentCodes.map((code) => `(${letter(ac.key)}${r}="${code}")`));
        cell.value = { formula: terms.join('+'), result: data?.value ?? 0 } as ExcelJS.CellFormulaValue;
      } else {
        cell.value = data?.value ?? null;
      }

      if (c.kind !== 'fullName' && c.kind !== 'studentCode') cell.alignment = { horizontal: 'center' };
      if (c.kind === 'score') cell.numFmt = '0.0#';
      if (c.kind === 'average') cell.numFmt = g.averageDecimals > 0 ? `0.${'0'.repeat(g.averageDecimals)}` : '0';
      if (c.kind === 'score') {
        // Màu điểm thấp do conditional formatting lo, nên sửa điểm trong file thì màu đổi theo
        cell.fill = solid(g.scoreColumnFill);
        if (data?.pending) cell.font = { italic: true, color: { argb: 'FF808080' } };
      } else {
        const style = data?.style;
        if (style?.fill) cell.fill = solid(style.fill);
        if (style?.font || style?.bold) cell.font = { color: { argb: argb(style.font) }, bold: style.bold };
      }
      cell.border = { top: thin, left: thin, bottom: thin, right: thin };
    });
  });

  if (g.rows.length > 0) {
    for (const sc of scoreCols) {
      const col = letter(sc.key);
      const ref = `${col}${firstData}`;
      const limit = +((g.lowScore.below * (sc.maxScore ?? 10)) / 10).toFixed(4);
      ws.addConditionalFormatting({
        ref: `${col}${firstData}:${col}${lastData}`,
        rules: [
          {
            type: 'expression',
            priority: 1,
            formulae: [`AND(ISNUMBER(${ref}),${ref}<${limit})`],
            style: {
              fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: argb(g.lowScore.fill) } },
              font: { color: { argb: argb(g.lowScore.font) } },
            },
          },
        ],
      });
    }
  }

  // Chú thích mã điểm danh và bài tập
  const legendRow = lastData + 2;
  ws.getCell(legendRow, 1).value =
    'Điểm danh: ' +
    g.attendanceCodes.map((c) => `${c.code} = ${c.label}`).join(', ') +
    ' · Bài tập: ' +
    g.homeworkCodes.map((c) => `${c.code} = ${c.label}`).join(', ') +
    ' · V = vắng kiểm tra (không tính vào điểm trung bình)';
  ws.getCell(legendRow, 1).font = { italic: true, color: { argb: 'FF595959' } };

  const frozenCols = g.columns.findIndex((c) => c.key === 'rank') + 1;
  ws.views = [{ state: 'frozen', ySplit: HEADER_ROW, xSplit: frozenCols }];
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
