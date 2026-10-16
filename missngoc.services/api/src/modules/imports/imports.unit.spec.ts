import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildImportPrompt } from './prompt';
import { answerKeysImportSpec } from './specs/answer-keys.spec';
import { parseDob, parsePhone, studentsImportSpec } from './specs/students.spec';
import { validateTable } from './validate';
import { readTable } from './workbook';

test('SĐT: thêm số 0 bị Excel làm mất, đổi +84, bỏ dấu cách', () => {
  assert.equal(parsePhone(912345678).value, '0912345678');
  assert.equal(parsePhone('+84 912 345 678').value, '0912345678');
  assert.equal(parsePhone('0912.345.678').value, '0912345678');
  assert.ok(parsePhone('0912').error);
  assert.ok(parsePhone('09123abc78').error);
});

test('Ngày sinh: dd/mm/yyyy, ô Date của Excel, ngày không có thật', () => {
  assert.equal(parseDob('05/09/2014').value?.toISOString().slice(0, 10), '2014-09-05');
  assert.equal(parseDob(new Date(Date.UTC(2013, 11, 21))).value?.toISOString().slice(0, 10), '2013-12-21');
  assert.equal(parseDob(41640).value?.toISOString().slice(0, 10), '2014-01-01'); // số ngày kiểu Excel
  assert.ok(parseDob('31/02/2014').error);
  assert.ok(parseDob('2014-09-05').error);
});

test('CSV dấu chấm phẩy, có dấu ngoặc kép, tiêu đề không dấu vẫn nhận', async () => {
  const csv = '﻿ma hs;ho ten;ngay sinh\n"HS1";"Nguyễn Văn ""Tí""";05/09/2014\n\n;trần thị bình;\n';
  const table = await readTable(Buffer.from(csv, 'utf8'), 'ds.csv');
  const preview = validateTable(studentsImportSpec, table, {});
  assert.deepEqual(preview.fileErrors, []);
  assert.equal(preview.rows.length, 2);
  assert.equal(preview.rows[0].values['Mã HS'], 'HS1');
  assert.equal(preview.rows[1].parsed.fullName, 'Trần Thị Bình');
});

test('Thiếu cột bắt buộc thì báo lỗi cả file', async () => {
  const table = await readTable(Buffer.from('Mã HS,Ngày sinh\nHS1,05/09/2014\n'), 'ds.csv');
  const preview = validateTable(studentsImportSpec, table, {});
  assert.equal(preview.canSave, false);
  assert.match(preview.fileErrors[0], /Họ và tên/);
});

test('Đáp án: nhiều đáp án đúng, chữ ngoài bộ lựa chọn, câu vượt số câu', async () => {
  const ctx = { questionCount: 3, options: 'ABCD' };
  const table = await readTable(Buffer.from('Câu,Đáp án\n1,"a, c"\n2,E\n4,B\n'), 'da.csv');
  const preview = validateTable(answerKeysImportSpec, table, ctx);
  assert.deepEqual(preview.rows[0].parsed.answer, { kind: 'choice', correct: ['A', 'C'] });
  assert.match(preview.rows[1].errors[0].message, /không thuộc bộ lựa chọn/);
  assert.match(preview.rows[2].errors[0].message, /từ 1 đến 3/);
});

test('Đáp án: câu điền từ, nhiều cách viết ngăn bằng dấu /', async () => {
  const ctx = { questionCount: 3, options: 'ABCD' };
  const table = await readTable(Buffer.from('Câu,Đáp án\n1,C\n2,twice\n3,eight hours / 8 hours\n'), 'da.csv');
  const preview = validateTable(answerKeysImportSpec, table, ctx);
  assert.deepEqual(preview.fileErrors, []);
  assert.deepEqual(preview.rows[0].parsed.answer, { kind: 'choice', correct: ['C'] });
  assert.deepEqual(preview.rows[1].parsed.answer, { kind: 'text', correct: ['twice'] });
  assert.deepEqual(preview.rows[2].parsed.answer, { kind: 'text', correct: ['eight hours', '8 hours'] });
});

test('Prompt chatbot điền sẵn số câu và mã đề của bài đang chọn', () => {
  const prompt = buildImportPrompt(answerKeysImportSpec, { questionCount: 40, options: 'ABCD', versionCodes: ['101', '102'] });
  assert.match(prompt, /có 40 câu, lựa chọn A–D, mã đề 101 và 102/);
  assert.match(prompt, /Dòng 1 là tiêu đề, ghi đúng tên cột: Mã đề \| Câu \| Đáp án \| Điểm/);
  assert.match(prompt, /Định dạng ô kiểu Text cho cột Mã đề,/);
  const students = buildImportPrompt(studentsImportSpec, { className: 'Starters 3A' });
  assert.match(students, /MỘT file Excel \(\.xlsx\)/);
  assert.match(students, /File có đúng 4 cột/);
  assert.match(students, /Tên file: Danh sách học sinh - Starters 3A\.xlsx/);
  assert.match(students, /Text cho cột Mã HS, Ngày sinh, SĐT phụ huynh/);
});
