/**
 * layout.js — 答题卡版式规范（单一数据源）
 * 模板打印（template.html）与识别程序（app.js）共用此文件，
 * 保证打印出来的答题卡与识别坐标严格一致。
 *
 * 坐标系：以 A4 页面（210mm × 297mm）为基准，单位 mm。
 * 模板按 mm 绝对定位打印；识别程序转换为矫正图像 (1240×1754px) 像素坐标。
 */
const LAYOUT = {
  W_mm: 210,           // A4 宽（mm）
  H_mm: 297,           // A4 高（mm）

  // 边距（与 docx 原版一致）
  marginTop: 25,
  marginBottom: 25,
  marginLeft: 19,
  marginRight: 31,

  // 页眉信息（3 行居中标题 + 1 行字段）
  titleLines: [
    { text: '石家庄现代医学中等专业学校', font: '12pt' },        // 学校名
    { text: '生理学基础', font: '16pt', bold: true },            // 学科
    { text: '2026学年一年级第一学期月考答题卡', font: '12pt' },   // 考试名（可被 URL 参数覆盖）
  ],
  fields: ['专业', '班级', '姓名', '学号'],

  // 4 个题目块：分别 3×5、3×5、3×5、1×5 共 50 题
  // blockTopY 单位 mm（页面顶到该块首行题号顶端的距离）
  blocks: [
    { topY: 56, qFrom: 1,  qTo: 15, cols: 3 }, // Q1-15
    { topY: 87, qFrom: 16, qTo: 30, cols: 3 }, // Q16-30
    { topY: 118, qFrom: 31, qTo: 45, cols: 3 }, // Q31-45
    { topY: 149, qFrom: 46, qTo: 50, cols: 1 }, // Q46-50
  ],

  // 每个块内：题目行的行高（mm）与选项宽度
  rowHeight: 5.5,        // 每道题占的行高（含上下间距），mm
  numberWidth: 6,        // 题号 "1." 占的宽度，mm
  optWidth: 7,           // 每个 [A] 选项框宽度，mm
  optGap: 0.5,           // 选项之间的间隙，mm

  // 块内列位置（mm，距左页边）
  // 3 列：分别约 19mm、72mm、125mm 起，列宽约 53mm
  colX_mm: [19, 72, 125], // 仅 cols=3 时使用；cols=46 时只用第一个
  blockWidth_mm: 165,    // 每个块占的总宽度（mm）

  // 题目编号后第一个选项框的偏移
  firstOptOffset: 7,     // mm，从题号右端起算

  // 选项格式字符
  options: ['A', 'B', 'C', 'D', 'E'],

  // 四角定位标记（OCR 识别用，mm，相对 A4 页边）
  locatorSize_mm: 8,
  locators: [
    { x: 6,  y: 18 },     // 左上
    { x: 196, y: 18 },    // 右上（210-14=196，往内 6+8=14）
    { x: 6,  y: 273 },    // 左下（297-18-6=273）
    { x: 196, y: 273 },   // 右下
  ],

  // 矫正图像尺寸（识别程序使用）
  W_px: 1240,
  H_px: 1754,
};

/** mm → px（在 1240×1754 矫正图像中） */
const MM2PX_X = 1240 / 210;  // ≈ 5.905
const MM2PX_Y = 1754 / 297;  // ≈ 5.906
function mm2px(x_mm, y_mm) {
  return { x: x_mm * MM2PX_X, y: y_mm * MM2PX_Y };
}

/**
 * 计算某道题某个选项框在矫正图像中的位置 {x, y, w, h}
 * @param {number} q 题号（1 起）
 * @param {number} optIdx 选项索引 0-4（A-E）
 */
function questionBox(q, optIdx) {
  const block = LAYOUT.blocks.find(b => q >= b.qFrom && q <= b.qTo);
  if (!block) throw new Error('题号越界：' + q);
  const k = q - block.qFrom;                       // 块内序号 0..n-1
  const row = k % 5;                                // 行号
  const col = Math.floor(k / 5);                    // 列号（0/1/2 或 0）
  const colX = LAYOUT.colX_mm[Math.min(col, LAYOUT.colX_mm.length - 1)];
  const px = mm2px(colX + LAYOUT.firstOptOffset + optIdx * (LAYOUT.optWidth + LAYOUT.optGap),
                   block.topY + row * LAYOUT.rowHeight);
  return {
    x: px.x,
    y: px.y,
    w: LAYOUT.optWidth * MM2PX_X,
    h: LAYOUT.rowHeight * 0.7 * MM2PX_Y,
  };
}

/** 题号文字（标签）在 A4 页面的 mm 坐标（用于模板绘制） */
function questionLabelMm(q) {
  const block = LAYOUT.blocks.find(b => q >= b.qFrom && q <= b.qTo);
  const k = q - block.qFrom;
  const row = k % 5;
  const col = Math.floor(k / 5);
  const colX = LAYOUT.colX_mm[Math.min(col, LAYOUT.colX_mm.length - 1)];
  return { x: colX, y: block.topY + row * LAYOUT.rowHeight };
}

/** 整个选项框（A-E）在 A4 页面的 mm 起点（模板用） */
function optionBoxMm(q, optIdx) {
  const block = LAYOUT.blocks.find(b => q >= b.qFrom && q <= b.qTo);
  const k = q - block.qFrom;
  const row = k % 5;
  const col = Math.floor(k / 5);
  const colX = LAYOUT.colX_mm[Math.min(col, LAYOUT.colX_mm.length - 1)];
  return {
    x: colX + LAYOUT.firstOptOffset + optIdx * (LAYOUT.optWidth + LAYOUT.optGap),
    y: block.topY + row * LAYOUT.rowHeight,
    w: LAYOUT.optWidth,
    h: LAYOUT.rowHeight * 0.7,
  };
}