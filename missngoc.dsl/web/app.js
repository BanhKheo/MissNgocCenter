// Trang soạn đề ExamDSL: gõ là kiểm tra ngay, lỗi gạch đỏ tại chỗ, xem trước đáp án và mô phỏng luật duyệt.
const $ = (id) => document.getElementById(id);
const src = $('source');
const hl = $('highlight');
const gutter = $('gutter');
let last = null;            // kết quả biên dịch gần nhất
let version = null;         // mã đề đang xem ở tab Đáp án
let timer = null;

const KEYWORDS = new Set(('exam questions options max versions layout section key choice text weight score report title ' +
  'columns style band else fill font review flag when count and or not in true false none').split(' '));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (x) => Number.isInteger(x) ? String(x) : String(+x.toFixed(3)).replace('.', ',');

async function api(path, body) {
  const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail?.message || data.detail || res.statusText);
  return data;
}

// ───────── tô màu + gạch lỗi: tính lớp của từng ký tự rồi gộp các ký tự liền nhau
function classify(line) {
  const cls = new Array(line.length).fill('');
  const re = /(\/\/.*$)|("(?:[^"\\]|\\.)*"?)|(#[0-9A-Fa-f]*)|(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(>=|<=|==|!=|[{}()[\],\-\/<>.])/g;
  let m;
  while ((m = re.exec(line))) {
    const kind = m[1] ? 't-com' : m[2] ? 't-str' : m[3] ? 't-color' : m[4] ? 't-num'
      : m[5] ? (KEYWORDS.has(m[5]) ? 't-kw' : /^[A-E]$/.test(m[5]) ? 't-letter' : '') : 't-op';
    for (let i = m.index; i < m.index + m[0].length; i++) cls[i] = kind;
  }
  return cls;
}

function render() {
  const lines = src.value.split('\n');
  const marks = {};          // dòng → [{from, to, sev}]
  for (const d of last?.diagnostics ?? []) {
    const to = d.end_line === d.line ? d.end_column : (lines[d.line - 1]?.length ?? 0) + 1;
    (marks[d.line] ??= []).push({ from: d.column - 1, to: Math.max(to - 1, d.column), sev: d.severity });
  }
  hl.innerHTML = lines.map((line, i) => {
    const cls = classify(line);
    const err = new Array(line.length).fill('');
    for (const mk of marks[i + 1] ?? []) {
      for (let c = mk.from; c < Math.min(mk.to, line.length); c++) err[c] = mk.sev === 'error' ? 'e-err' : (err[c] || 'e-warn');
    }
    let html = '', run = '', key = null;
    for (let c = 0; c <= line.length; c++) {
      const k = c < line.length ? `${cls[c]} ${err[c]}`.trim() : null;
      if (k !== key && run) { html += key ? `<span class="${key}">${esc(run)}</span>` : esc(run); run = ''; }
      if (c < line.length) { run += line[c]; key = k; }
    }
    return html;
  }).join('\n') + '\n';
  gutter.innerHTML = lines.map((_, i) => {
    const sev = (marks[i + 1] ?? []).some((m) => m.sev === 'error') ? 'err' : (marks[i + 1] ? 'warn' : '');
    return `<div class="${sev}">${i + 1}</div>`;
  }).join('');
  src.style.height = `${lines.length * 22 + 24}px`;
  src.parentElement.style.minWidth = `calc(${Math.max(...lines.map((l) => l.length))}ch + 48px)`;
}

// ───────── biên dịch
async function compile() {
  try {
    last = await api('api/compile', { source: src.value });
  } catch (e) {
    $('status').textContent = 'Không gọi được server';
    $('status').className = 'status err';
    return;
  }
  render();
  const errs = last.diagnostics.filter((d) => d.severity === 'error').length;
  const warns = last.diagnostics.length - errs;
  const st = $('status');
  if (errs) { st.textContent = `${errs} lỗi`; st.className = 'status err'; }
  else if (warns) { st.textContent = `Hợp lệ · ${warns} cảnh báo`; st.className = 'status warn'; }
  else { st.textContent = 'Hợp lệ, sẵn sàng gửi app'; st.className = 'status ok'; }
  renderProblems();
  renderOverview();
  renderKeys();
  renderJson();
}

const PHASE = { lexical: 'từ vựng', syntax: 'cú pháp', semantic: 'ngữ nghĩa', optimize: 'tối ưu' };
function renderProblems() {
  const box = $('problems');
  if (!last.diagnostics.length) { box.innerHTML = '<div class="empty">Không có lỗi</div>'; return; }
  box.innerHTML = last.diagnostics.map((d, i) =>
    `<div class="problem ${d.severity}" data-i="${i}"><span class="code-badge">${d.code}</span>` +
    `<span class="pos">${d.line}:${d.column}</span><span>${esc(d.message)} <span class="muted">· pha ${PHASE[d.phase] ?? d.phase}</span></span></div>`).join('');
  box.querySelectorAll('.problem').forEach((el) => el.onclick = () => goTo(last.diagnostics[+el.dataset.i]));
}

function goTo(d) {
  const lines = src.value.split('\n');
  let pos = 0;
  for (let i = 0; i < d.line - 1; i++) pos += lines[i].length + 1;
  src.focus();
  src.setSelectionRange(pos + d.column - 1, pos + (d.end_line === d.line ? d.end_column - 1 : d.column));
  src.parentElement.parentElement.scrollTop = Math.max(0, (d.line - 5) * 22);
}

function sectionColor(i) { return ['#CCE7E4', '#FDE7D3', '#E0E7FF', '#FCE7F3', '#E5E7EB'][i % 5]; }

function renderOverview() {
  const box = $('tab-overview');
  const p = last.preview;
  if (!p) { box.innerHTML = '<p class="muted">Sửa hết lỗi để xem tóm tắt đề.</p>'; return; }
  const versions = p.versions.map((v) => v || 'một mã đề chung').join(', ');
  box.innerHTML = `
    <h2>${esc(p.title)}</h2><div class="muted">Bộ lựa chọn ${p.options.split('').join(' ')} · ${versions}</div>
    <div class="stats">
      <div class="stat"><b>${p.questions}</b><span>câu</span></div>
      <div class="stat"><b>${p.versions.length}</b><span>mã đề</span></div>
      <div class="stat"><b>${fmt(p.max)}</b><span>thang điểm</span></div>
      <div class="stat"><b>${p.rules.length}</b><span>luật duyệt</span></div>
    </div>
    <h3>Các phần và điểm từng câu (trình biên dịch tính sẵn)</h3>
    ${p.sections.length ? `<table><tr><th>Phần</th><th>Loại câu</th><th class="num">Số câu</th><th class="num">Điểm/câu</th><th class="num">Tổng</th></tr>
      ${p.sections.map((s, i) => `<tr><td><span class="swatch" style="background:${sectionColor(i)}"></span> ${esc(s.name)}</td><td>${s.kind === 'text' ? 'Điền từ' : 'Trắc nghiệm'}</td>
        <td class="num">${s.questions}</td><td class="num">${fmt(s.perQuestion)}</td><td class="num">${fmt(s.points)}</td></tr>`).join('')}
      <tr><td><b>Cộng</b></td><td></td><td class="num"><b>${p.questions}</b></td><td></td><td class="num"><b>${fmt(p.totalPoints)}</b></td></tr></table>`
      : '<p class="muted">Không khai báo phần: chia đều thang điểm cho mọi câu.</p>'}
    <h3>Xếp loại trên bảng điểm (thang 10)</h3>
    <div class="bands">${p.bands.map((b, i) => `<span class="band" style="background:${b.fill};color:${b.font}">${esc(b.label)}<small>${i === p.bands.length - 1 ? 'còn lại' : '≥ ' + fmt(b.min)}</small></span>`).join('')}</div>
    <h3>Luật duyệt${p.defaultReview ? ' (mặc định, giống app hiện nay)' : ''}</h3>
    ${p.rules.map((r) => `<div class="rule"><b>${esc(r.message ?? 'Cần duyệt')}</b><span class="scope">${r.scope === 'answer' ? 'theo từng câu' : 'theo cả bài'}</span><code>${esc(r.when)}</code></div>`).join('')}`;
}

function renderKeys() {
  const box = $('tab-keys');
  const out = last.outputs;
  if (!out) { box.innerHTML = '<p class="muted">Sửa hết lỗi để xem bảng đáp án.</p>'; return; }
  const codes = Object.keys(out.keys);
  if (!codes.includes(version)) version = codes[0];
  const sections = last.preview.sections;
  const secOf = {};
  for (const node of last.ast.exam.sections) {
    const idx = sections.findIndex((s) => s.name === node.name);
    for (const r of node.ranges) for (let q = r.start; q <= r.end; q++) secOf[q] = idx;
  }
  box.innerHTML = `
    <div class="versions">${codes.map((c) => `<button data-v="${c}" class="${c === version ? 'active' : ''}">${c === '_' ? 'Mã đề chung' : 'Mã đề ' + c}</button>`).join('')}</div>
    <div class="qgrid">${out.keys[version].items.map((it) => `
      <div class="q ${it.kind}" style="background:${secOf[it.q] !== undefined ? sectionColor(secOf[it.q]) : '#fff'}">
        <div class="n"><span>Câu ${it.q}</span><span>${fmt(it.points)}đ</span></div>
        <div class="a" title="${esc(it.correct.join(' / '))}">${esc(it.correct.join(it.kind === 'text' ? ' / ' : ' hoặc '))}</div>
      </div>`).join('')}</div>
    <div class="legend">${sections.map((s, i) => `<span><i style="background:${sectionColor(i)}"></i>${esc(s.name)}</span>`).join('')}</div>`;
  box.querySelectorAll('.versions button').forEach((b) => b.onclick = () => { version = b.dataset.v; renderKeys(); });
}

function renderJson() {
  const out = last.outputs;
  $('json-out').textContent = out ? JSON.stringify(out[$('json-target').value], null, 2) : 'Sửa hết lỗi để sinh JSON.';
}

async function simulate() {
  const box = $('sim-out');
  box.innerHTML = '<p class="muted">Đang chạy…</p>';
  try {
    const r = await api('api/simulate', { source: src.value, sheets: $('sheets').value });
    const s = r.summary;
    box.innerHTML = `
      <div class="stats">
        <div class="stat"><b>${s.needsReview}/${s.submissions}</b><span>bài cần duyệt</span></div>
        <div class="stat"><b>${String(s.needsReviewPercent).replace('.', ',')}%</b><span>tỉ lệ phải duyệt</span></div>
        <div class="stat"><b>${s.averageScore === null ? '—' : fmt(s.averageScore)}</b><span>điểm trung bình</span></div>
        <div class="stat"><b>${s.uncertainNotFlagged}</b><span>câu không chắc lọt qua</span></div>
      </div>
      <h3>Từng luật</h3>
      <table><tr><th>Luật</th><th class="num">Số bài</th><th class="num">Số cờ</th></tr>
        ${Object.entries(s.perRule).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v.submissions}</td><td class="num">${v.flags}</td></tr>`).join('')}</table>
      <h3>Từng bài</h3>
      <table><tr><th>Học sinh</th><th class="num">Điểm</th><th>Xếp loại</th><th>Trạng thái</th></tr>
        ${r.results.map((x) => {
          const why = {};
          for (const f of x.flags) (why[f.rule] ??= []).push(f.q);
          const text = Object.entries(why).map(([k, qs]) => k + (qs.some((q) => q) ? ` (câu ${qs.filter(Boolean).join(', ')})` : '')).join('; ');
          return `<tr><td>${esc(x.student)}${text ? `<div class="why">${esc(text)}</div>` : ''}</td><td class="num">${x.score === null ? '—' : fmt(x.score)}</td>
            <td>${esc(x.band ?? '—')}</td><td>${x.status === 'GRADED' ? '<span class="tag done">Đã chấm</span>' : '<span class="tag review">Cần duyệt</span>'}</td></tr>`;
        }).join('')}</table>`;
  } catch (e) {
    box.innerHTML = `<p style="color:var(--error)">${esc(e.message)}</p>`;
  }
}

// ───────── sự kiện
src.addEventListener('input', () => { render(); clearTimeout(timer); timer = setTimeout(compile, 250); });
src.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); }
});
src.addEventListener('keyup', cursor);
src.addEventListener('click', cursor);
function cursor() {
  const before = src.value.slice(0, src.selectionStart).split('\n');
  $('cursor').textContent = `Dòng ${before.length}, cột ${before[before.length - 1].length + 1}`;
}
$('tabs').querySelectorAll('button').forEach((b) => b.onclick = () => {
  $('tabs').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
  document.querySelectorAll('.tab-body').forEach((t) => t.classList.toggle('hidden', t.id !== 'tab-' + b.dataset.tab));
});
$('json-target').onchange = renderJson;
$('copy-json').onclick = () => navigator.clipboard.writeText($('json-out').textContent);
$('run-sim').onclick = simulate;
$('examples').onchange = () => load($('examples').value);
$('open').onclick = () => $('file-input').click();
$('file-input').onchange = async () => {
  const f = $('file-input').files[0];
  if (!f) return;
  src.value = await f.text();
  $('file-name').textContent = f.name;
  compile();
};
$('save').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([src.value], { type: 'text/plain' }));
  a.download = $('file-name').textContent.endsWith('.exam') ? $('file-name').textContent : 'de-thi.exam';
  a.click();
};

async function load(name) {
  const ex = await api(`api/examples/${name}`);
  src.value = ex.source;
  $('file-name').textContent = name + '.exam';
  history.replaceState(null, '', `#${name}`);
  compile();
}

(async function init() {
  const examples = await api('api/examples');
  $('examples').innerHTML = examples.map((e) => `<option value="${e.name}">${esc(e.name.startsWith('errors/') ? 'Lỗi ' + e.title : e.name)}</option>`).join('');
  const sheets = await api('api/sheets');
  $('sheets').innerHTML = sheets.map((s) => `<option>${s.name}</option>`).join('');
  const start = decodeURIComponent(location.hash.slice(1)) || 'unit5-demo';
  $('examples').value = start;
  await load(start);
  const tab = new URLSearchParams(location.search).get('tab');
  if (tab) document.querySelector(`[data-tab="${tab}"]`)?.click();
  if (tab === 'simulate') simulate();
})();
