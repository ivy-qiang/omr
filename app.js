/**
 * app.js — 答题卡识别与判卷核心逻辑（浏览器端运行，无需服务器）
 * 流程：照片 → 页面矫正 → 四角定位块二次矫正 → 逐格测涂黑率 → 对比答案 → 出分
 */
'use strict';

/* ================= 全局状态 ================= */
let cvReady = false;
let exams = [];        // [{id,name,count,perScore,answers[],createdAt}]
let currentExamId = null;
let editingExam = null; // 录入答案区当前编辑对象
let sheets = [];        // [{id,name:'第N张',ratios:[[..5]x50],warpedURL,locatorOk,answers[],score,wrongIdx[],student:{name,id}}]
let gradingExamId = null; // 本次判卷所属考试

const $ = id => document.getElementById(id);

/* ================= OpenCV 加载 ================= */
function waitOpenCV() {
  return new Promise((resolve, reject) => {
    const check = () => { if (window.cv && cv.Mat) { resolve(); return true; } return false; };
    if (check()) { resolve(); return; }
    let done = false;
    const fin = () => { if (!done) { done = true; check() ? resolve() : reject(new Error('OpenCV 初始化失败')); } };
    if (window.cv && typeof cv.onRuntimeInitialized !== 'undefined') { cv.onRuntimeInitialized = fin; }
    if (window.cv && typeof window.cv.then === 'function') { window.cv.then(fin).catch(fin); }
    const timer = setInterval(() => { if (check()) { clearInterval(timer); clearTimeout(giveup); fin(); } }, 300);
    const giveup = setTimeout(() => { clearInterval(timer); if (!done) reject(new Error('OpenCV 加载超时')); }, 60000);
  });
}

/* ================= 图像处理 ================= */

/** 读文件 → 缩放画布 */
async function fileToCanvas(file) {
  const bmp = await createImageBitmap(file);
  const maxDim = 2000;
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close && bmp.close();
  return c;
}

/** 找最大四边形（纸张轮廓） */
function findPageQuad(gray) {
  const blur = new cv.Mat(), bin = new cv.Mat();
  cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
  cv.Canny(blur, bin, 50, 150);
  cv.dilate(bin, bin, cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5)));
  const contours = new cv.MatVector(), hierarchy = new cv.Mat();
  cv.findContours(bin, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  let best = null, bestArea = 0;
  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    const area = Math.abs(cv.contourArea(cnt));
    if (area < gray.cols * gray.rows * 0.25) { cnt.delete(); continue; }
    const peri = cv.arcLength(cnt, true);
    const approx = new cv.Mat();
    cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
    if (approx.rows === 4 && area > bestArea) { bestArea = area; if (best) best.delete(); best = approx; }
    else approx.delete();
    cnt.delete();
  }
  blur.delete(); bin.delete(); contours.delete(); hierarchy.delete();
  return best; // Mat 4x1 CV_32SC2 或 null
}

function quadToPoints(quad) {
  const pts = [];
  for (let i = 0; i < 4; i++) pts.push([quad.data32S[i * 2], quad.data32S[i * 2 + 1]]);
  // 排序：左上、右上、右下、左下
  pts.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
  const [tl, br, rem1, rem2] = pts;
  // 剩余两点：x 小的是左下(BL)，x 大的是右上(TR)
  const [bl, tr] = [rem1, rem2].sort((a, b) => a[0] - b[0]);
  return [tl, tr, bl, br];
}

/** 在矫正图中找某角定位块中心 */
function findLocator(warpedGray, cx, cy) {
  const R = 130, S = new cv.Size(2 * R, 2 * R);
  const x0 = Math.max(0, cx - R), y0 = Math.max(0, cy - R);
  const w = Math.min(warpedGray.cols - x0, 2 * R), h = Math.min(warpedGray.rows - y0, 2 * R);
  if (w <= 10 || h <= 10) return null;
  const roi = warpedGray.roi(new cv.Rect(x0, y0, w, h));
  const bin = new cv.Mat();
  cv.threshold(roi, bin, 110, 255, cv.THRESH_BINARY_INV);
  const contours = new cv.MatVector(), hierarchy = new cv.Mat();
  cv.findContours(bin, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  let best = null, bestArea = 0;
  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    const area = cv.contourArea(cnt);
    if (area > 800 && area < 2 * R * R * 0.7 && area > bestArea) {
      const peri = cv.arcLength(cnt, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, 0.03 * peri, true);
      if (approx.rows === 4) { bestArea = area; if (best) best.delete(); best = approx; }
      else approx.delete();
    }
    cnt.delete();
  }
  let center = null;
  if (best) {
    const m = cv.moments(best);
    if (m.m00 > 0) center = [x0 + m.m10 / m.m00, y0 + m.m01 / m.m00];
    best.delete();
  }
  roi.delete(); bin.delete(); contours.delete(); hierarchy.delete();
  return center;
}

/** 单张照片 → 矫正画布（含两次矫正） */
function processCanvas(canvas) {
  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  // 第一次：按纸张轮廓粗矫正
  let stage1 = null, locatorOk = false;
  const quad = findPageQuad(gray);
  if (quad) {
    const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, quadToPoints(quad).flat());
    const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2,
      [0, 0, LAYOUT.W_px - 1, 0, 0, LAYOUT.H_px - 1, LAYOUT.W_px - 1, LAYOUT.H_px - 1]);
    const M = cv.getPerspectiveTransform(srcTri, dstTri);
    stage1 = new cv.Mat();
    cv.warpPerspective(src, stage1, M, new cv.Size(LAYOUT.W_px, LAYOUT.H_px));
    M.delete(); srcTri.delete(); dstTri.delete();
  } else {
    stage1 = src.clone(); // 无四边形则直接用原图
  }

  // 第二次：四角定位块精矫正
  const g1 = new cv.Mat();
  cv.cvtColor(stage1, g1, cv.COLOR_RGBA2GRAY);
  // locators 在 layout.js 中以 mm 为单位，转换为矫正图像像素坐标
  const expected = LAYOUT.locators.map(p => [p.x * MM2PX_X, p.y * MM2PX_Y]);
  const found = [];
  for (const [ex, ey] of expected) {
    const c = findLocator(g1, ex, ey);
    if (c) found.push(c);
  }
  let final = null;
  if (found.length === 4) {
    // 按与期望位置的对应关系排序
    found.sort((a, b) => (a[1] + a[0] * 0.3) - (b[1] + b[0] * 0.3));
    const top2 = found.slice(0, 2).sort((a, b) => a[0] - b[0]);
    const bot2 = found.slice(2, 4).sort((a, b) => a[0] - b[0]);
    const order = [top2[0], top2[1], bot2[0], bot2[1]]; // TL TR BL BR
    const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, order.flat());
    const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, expected.flat());
    const M = cv.getPerspectiveTransform(srcTri, dstTri);
    final = new cv.Mat();
    cv.warpPerspective(stage1, final, M, new cv.Size(LAYOUT.W_px, LAYOUT.H_px));
    M.delete(); srcTri.delete(); dstTri.delete();
    locatorOk = true;
  } else {
    final = stage1.clone();
  }

  // 输出画布
  const out = document.createElement('canvas');
  out.width = LAYOUT.W_px; out.height = LAYOUT.H_px;
  cv.imshow(out, final);

  // 测量每个选项框的涂黑率
  const ratios = measureRatios(final);

  src.delete(); gray.delete(); stage1.delete(); g1.delete(); final.delete();
  if (quad) quad.delete();
  return { warpedCanvas: out, ratios, locatorOk };
}

/** 测量 50 题 × 5 选项的涂黑率 */
function measureRatios(mat) {
  let gray = new cv.Mat();
  if (mat.channels() > 1) cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY); else gray = mat.clone();
  const totalQ = 50;
  const ratios = [];
  for (let q = 1; q <= totalQ; q++) {
    const row = [];
    for (let i = 0; i < 5; i++) {
      const b = questionBox(q, i);
      const mx = Math.round(b.w * 0.16), my = Math.round(b.h * 0.18);
      const rx = b.x + mx, ry = b.y + my, rw = b.w - 2 * mx, rh = b.h - 2 * my;
      let ratio = 0;
      if (rx >= 0 && ry >= 0 && rx + rw <= gray.cols && ry + rh <= gray.rows && rw > 2 && rh > 2) {
        const roi = gray.roi(new cv.Rect(rx, ry, rw, rh));
        const std = new cv.Mat();
        cv.meanStdDev(roi, new cv.Mat(), std);
        const sd = std.data64F[0];
        if (sd > 10) {
          const bin = new cv.Mat();
          cv.threshold(roi, bin, 0, 255, cv.THRESH_BINARY_INV | cv.THRESH_OTSU);
          ratio = cv.countNonZero(bin) / (rw * rh);
          bin.delete();
        }
        std.delete(); roi.delete();
      }
      row.push(ratio);
    }
    ratios.push(row);
  }
  gray.delete();
  return ratios;
}

/** 由涂黑率 + 阈值 → 每题作答 */
function answersFromRatios(ratios, thresh) {
  return ratios.map(row => {
    const maxI = row.indexOf(Math.max(...row));
    const filled = row.map(r => r >= thresh);
    const nFilled = filled.filter(Boolean).length;
    if (nFilled === 0) return '';
    if (nFilled >= 2) return 'X'; // 多涂
    return LAYOUT.options[maxI];
  });
}

/* ================= 判卷 UI ================= */
async function handleFiles(fileList) {
  const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
  if (!files.length) return;
  if (!cvReady) { alert('识别引擎还在加载，请等几秒后再试'); return; }
  const exam = exams.find(e => e.id === currentExamId);
  if (!exam) { alert('请先在「考试管理」创建并保存考试'); switchTab('exam'); return; }
  gradingExamId = exam.id;

  const prog = $('progress');
  prog.style.display = 'block';
  for (let i = 0; i < files.length; i++) {
    prog.textContent = `正在识别第 ${sheets.length + 1} 张（${i + 1}/${files.length}）…`;
    try {
      const canvas = await fileToCanvas(files[i]);
      const { warpedCanvas, ratios, locatorOk } = processCanvas(canvas);
      const sheet = {
        id: Date.now() + '_' + i,
        ratios, warpedURL: warpedCanvas.toDataURL('image/jpeg', 0.85),
        locatorOk,
        student: { name: '', id: '' },
      };
      sheets.push(sheet);
      gradeSheet(sheet, parseFloat($('thresh').value), exam);
    } catch (err) {
      console.error(err);
      alert('第 ' + (i + 1) + ' 张识别失败：' + err.message);
    }
  }
  prog.style.display = 'none';
  renderSheets();
  renderStats();
  $('regradeBtn').disabled = false;
}

function gradeSheet(sheet, thresh, exam) {
  const ans = answersFromRatios(sheet.ratios, thresh);
  sheet.answers = ans;
  sheet.wrongIdx = [];
  let correct = 0;
  ans.forEach((a, i) => {
    if (a && a === exam.answers[i]) correct++;
    else sheet.wrongIdx.push(i);
  });
  sheet.correct = correct;
  sheet.score = (correct * exam.perScore).toFixed(1).replace(/\.0$/, '');
}

function renderSheets() {
  const exam = exams.find(e => e.id === gradingExamId) || exams.find(e => e.id === currentExamId);
  const list = $('sheetList');
  if (!exam || !sheets.length) { list.innerHTML = '<p class="empty">还没有识别记录，先拍照或选择图片吧</p>'; return; }
  list.innerHTML = sheets.map((s, idx) => {
    const ansHtml = s.answers.map((a, i) => {
      let cls = 'ok', t = a || '—';
      if (!a) cls = 'warn';
      else if (a === 'X') cls = 'bad';
      else if (a !== exam.answers[i]) cls = 'bad';
      return `<b class="${cls}" title="第${i + 1}题 正确:${exam.answers[i]}">${t}</b>`;
    }).join('');
    return `<div class="sheet">
      <div class="sheet-head">
        <div>
          <span style="font-weight:600">第 ${idx + 1} 张</span>
          <input type="text" placeholder="姓名" value="${s.student.name}" oninput="sheets[${idx}].student.name=this.value">
          <input type="text" placeholder="学号" value="${s.student.id}" oninput="sheets[${idx}].student.id=this.value">
          ${s.locatorOk ? '' : '<span class="warnTag">⚠ 定位块未识别，结果可能偏移</span>'}
        </div>
        <div class="score">${s.score}<small> / ${exam.count * exam.perScore}分</small></div>
      </div>
      <div class="ansline">
        <span class="muted">错误 ${s.wrongIdx.length} 题：</span>${s.wrongIdx.map(i => `<b class="bad">${i + 1}</b>`).join(' ') || '<span class="muted">全对 🎉</span>'}
        <br>${ansHtml}
      </div>
      <details><summary>👁 查看矫正识别图（检查识别是否准确）</summary>
        <div class="debugbox"><img src="${s.warpedURL}" style="width:100%;border:1px solid #e3e6ea;border-radius:8px"></div>
      </details>
    </div>`;
  }).join('');
}

function regradeAll() {
  const exam = exams.find(e => e.id === gradingExamId);
  if (!exam || !sheets.length) return;
  const thresh = parseFloat($('thresh').value);
  $('thVal').textContent = thresh.toFixed(2);
  sheets.forEach(s => gradeSheet(s, thresh, exam));
  renderSheets(); renderStats();
}

/* ================= 统计 ================= */
function renderStats() {
  const exam = exams.find(e => e.id === gradingExamId);
  const cards = $('statCards'), errList = $('errList'), table = $('statTable');
  if (!exam || !sheets.length) {
    cards.innerHTML = ''; errList.innerHTML = '<p class="empty">暂无判卷数据</p>';
    table.innerHTML = '<p class="empty">暂无判卷数据</p>'; return;
  }
  const n = sheets.length;
  const scores = sheets.map(s => parseFloat(s.score));
  const avg = (scores.reduce((a, b) => a + b, 0) / n).toFixed(1);
  const max = Math.max(...scores), min = Math.min(...scores);
  const full = exam.count * exam.perScore;
  cards.innerHTML = `
    <div class="stat"><div class="v">${n}</div><div class="k">已判份数</div></div>
    <div class="stat"><div class="v">${avg}</div><div class="k">平均分</div></div>
    <div class="stat"><div class="v">${max}</div><div class="k">最高分</div></div>
    <div class="stat"><div class="v">${min}</div><div class="k">最低分</div></div>
    <div class="stat"><div class="v">${full}</div><div class="k">满分</div></div>`;

  const errCount = new Array(exam.count).fill(0);
  sheets.forEach(s => s.wrongIdx.forEach(i => errCount[i]++));
  const ranked = errCount.map((c, i) => ({ q: i + 1, c, pct: c / n })).sort((a, b) => b.c - a.c).slice(0, 15);
  errList.innerHTML = ranked.filter(r => r.c > 0).map(r => `
    <div class="errbar"><span class="lab">第${r.q}题</span>
      <div class="bar" style="width:${Math.round(r.pct * 100 * 4)}px"></div>
      <span class="pct">${r.c}/${n}（${Math.round(r.pct * 100)}%）</span></div>
  `).join('') || '<p class="empty">无错误记录 🎉</p>';

  table.innerHTML = `<table class="export"><tr><th>#</th><th>姓名</th><th>学号</th><th>得分</th><th>正确</th><th>错题</th></tr>` +
    sheets.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.student.name)}</td><td>${esc(s.student.id)}</td>
      <td><b>${s.score}</b>/${full}</td><td>${s.correct}</td><td>${s.wrongIdx.map(x => x + 1).join(',') || '—'}</td></tr>`).join('') + '</table>';
}
const esc = s => String(s || '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

/* ================= CSV 导出 ================= */
function exportCSV() {
  const exam = exams.find(e => e.id === gradingExamId);
  if (!exam || !sheets.length) { alert('暂无成绩可导出'); return; }
  const full = exam.count * exam.perScore;
  let csv = '\ufeff姓名,学号,得分,满分,正确数,错题,作答串\n';
  sheets.forEach((s, i) => {
    csv += `${s.student.name || '第' + (i + 1) + '张'},${s.student.id},${s.score},${full},${s.correct},"${s.wrongIdx.map(x => x + 1).join(',')}",${s.answers.join('')}\n`;
  });
  download(`成绩_${exam.name}_${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv');
}
function download(filename, content, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime + ';charset=utf-8' }));
  a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* ================= 考试管理 ================= */
function loadExams() {
  try { exams = JSON.parse(localStorage.getItem('omr_exams') || '[]'); } catch { exams = []; }
  currentExamId = localStorage.getItem('omr_current') || (exams[0] && exams[0].id) || null;
}
function persistExams() {
  localStorage.setItem('omr_exams', JSON.stringify(exams));
  localStorage.setItem('omr_current', currentExamId || '');
}
function newEditingExam() {
  return { id: 'ex_' + Date.now(), name: '', count: 50, perScore: 2, answers: new Array(50).fill('') };
}
function startAnswerEdit() {
  editingExam = newEditingExam();
  editingExam.name = $('examName').value.trim();
  editingExam.count = parseInt($('examCount').value);
  editingExam.perScore = parseFloat($('examPer').value);
  editingExam.answers = new Array(editingExam.count).fill('');
  renderAnswerGrid();
  $('saveMsg').textContent = '';
}
function renderAnswerGrid() {
  if (!editingExam) return;
  $('answerGrid').innerHTML = editingExam.answers.map((a, i) => `
    <div class="aq"><div class="qn">${i + 1}</div><div class="opts">
      ${LAYOUT.options.map(o => `<button class="${a === o ? 'sel' : ''}" onclick="setAnswer(${i},'${o}')">${o}</button>`).join('')}
    </div></div>`).join('');
}
function setAnswer(i, o) {
  editingExam.answers[i] = editingExam.answers[i] === o ? '' : o;
  renderAnswerGrid();
}
function saveExam() {
  if (!editingExam) { alert('请先点「录入答案」'); return; }
  editingExam.name = $('examName').value.trim() || '未命名考试 ' + new Date().toLocaleDateString();
  const emptyQ = editingExam.answers.findIndex(a => !a);
  if (emptyQ >= 0 && !confirm(`第 ${emptyQ + 1} 题还没设置答案，确定要保存吗？`)) return;
  const idx = exams.findIndex(e => e.id === editingExam.id);
  if (idx >= 0) exams[idx] = editingExam; else exams.push(editingExam);
  currentExamId = editingExam.id;
  persistExams();
  $('saveMsg').textContent = '✅ 已保存：' + editingExam.name;
  refreshExamSelect(); renderExamTable();
}
function deleteExam() {
  if (!editingExam) { alert('请先选择要删除的考试'); return; }
  if (!confirm('确定删除考试「' + (editingExam.name || '未命名') + '」？')) return;
  exams = exams.filter(e => e.id !== editingExam.id);
  if (currentExamId === editingExam.id) currentExamId = exams[0] ? exams[0].id : null;
  editingExam = null; $('answerGrid').innerHTML = '';
  persistExams(); refreshExamSelect(); renderExamTable();
}
function refreshExamSelect() {
  $('examSelect').innerHTML = exams.length
    ? exams.map(e => `<option value="${e.id}" ${e.id === currentExamId ? 'selected' : ''}>${esc(e.name)}（${e.count}题）</option>`).join('')
    : '<option value="">—— 请先创建考试 ——</option>';
  updateExamInfo();
}
function updateExamInfo() {
  const e = exams.find(x => x.id === currentExamId);
  $('examInfo').textContent = e ? `满分 ${e.count * e.perScore} 分 · ${e.count} 题 · 每题 ${e.perScore} 分` : '';
}
function renderExamTable() {
  const t = $('examTable');
  t.innerHTML = exams.length ? `<table class="export"><tr><th>名称</th><th>题数</th><th>每题分</th><th>答案</th><th></th></tr>` +
    exams.map(e => `<tr><td>${esc(e.name)}</td><td>${e.count}</td><td>${e.perScore}</td>
      <td style="max-width:180px;word-break:break-all;font-size:11px">${e.answers.map(a => a || '?').join('')}</td>
      <td><button class="btn gray" onclick="editExisting('${e.id}')">编辑</button></td></tr>`).join('') + '</table>'
    : '<p class="empty">还没有保存的考试</p>';
}
function editExisting(id) {
  const e = exams.find(x => x.id === id);
  editingExam = JSON.parse(JSON.stringify(e));
  $('examName').value = e.name; $('examCount').value = e.count; $('examPer').value = e.perScore;
  renderAnswerGrid();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function importExamJson(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!Array.isArray(d.answers)) throw new Error('缺少 answers 数组');
      editingExam = {
        id: 'ex_' + Date.now(), name: d.name || '导入考试',
        count: d.answers.length, perScore: d.perScore || 2,
        answers: d.answers.map(a => String(a || '').toUpperCase().trim()),
      };
      $('examName').value = editingExam.name;
      $('examCount').value = editingExam.count > 50 ? '50' : String(editingExam.count);
      $('examPer').value = String(editingExam.perScore);
      renderAnswerGrid();
      $('saveMsg').textContent = '已导入，请检查后点「保存考试」';
    } catch (e) { alert('JSON 解析失败：' + e.message); }
  };
  r.readAsText(file);
}
function exportExamJson() {
  const e = editingExam || exams.find(x => x.id === currentExamId);
  if (!e) { alert('没有可导出的考试'); return; }
  download(`答案_${e.name}.json`, JSON.stringify({ name: e.name, count: e.count, perScore: e.perScore, answers: e.answers }, null, 2), 'application/json');
}

/* ================= Tab 与事件绑定 ================= */
function switchTab(name) {
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.page === name));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + name));
  if (name === 'stats') renderStats();
}

document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.page)));
$('fileInput').addEventListener('change', e => { handleFiles(e.target.files); e.target.value = ''; });
$('thresh').addEventListener('input', e => { $('thVal').textContent = parseFloat(e.target.value).toFixed(2); });
$('examSelect').addEventListener('change', e => { currentExamId = e.target.value; persistExams(); updateExamInfo(); });
$('importJson').addEventListener('change', e => { if (e.target.files[0]) importExamJson(e.target.files[0]); e.target.value = ''; });

/* ================= 启动 ================= */
(async function init() {
  loadExams();
  refreshExamSelect();
  renderExamTable();
  renderSheets();
  try {
    await waitOpenCV();
    cvReady = true;
    console.log('OpenCV 就绪');
  } catch (e) {
    alert('识别引擎加载失败，请检查网络后刷新页面：' + e.message);
  }
})();
