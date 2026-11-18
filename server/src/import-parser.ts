/**
 * 题库导入解析器（零第三方依赖）
 *
 * 支持：.docx / .xlsx / .csv / .txt / .md
 * - .docx：内置 ZIP 读取器解压 word/document.xml，按段落提取文本
 * - .xlsx：解压 sharedStrings + sheet1，还原二维表格
 * - .csv / .txt / .md：UTF-8 优先，乱码自动回退 GBK
 *
 * 题目识别：题干编号、选项(A. B. C.)、答案/解析/考点/分类/难度/标签/题型字段行，
 * 输出与 questions 表字段对齐的结构化题目（valid=false 的附原因，不写入）。
 */
import { inflateRawSync } from 'node:zlib';

export interface ParsedQuestion {
  title: string;
  type: 'single_choice' | 'multiple_choice' | 'true_false' | 'fill_blank' | 'short_answer';
  difficulty: 'easy' | 'medium' | 'hard';
  options: { key: string; text: string }[];
  answer: unknown;
  explanation: string;
  knowledgePoint: string;
  categoryName: string;
  tags: string[];
  source: string;
  valid: boolean;
  problem?: string;
}

export interface ParseResult {
  questions: ParsedQuestion[];
  errors: string[];
}

export const QUESTION_TYPES = [
  'single_choice',
  'multiple_choice',
  'true_false',
  'fill_blank',
  'short_answer',
] as const;
export type QuestionTypeValue = (typeof QUESTION_TYPES)[number];

const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
type DifficultyValue = (typeof DIFFICULTIES)[number];

// ============ 基础工具 ============

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function colLettersToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** 在 ZIP 中央目录中定位条目并解压（支持 store / deflate） */
function readZipEntry(buffer: Buffer, entryName: string): Buffer | null {
  // 定位 EOCD 记录（0x06054b50），从尾部向前扫描
  let eocd = -1;
  const minPos = Math.max(0, buffer.length - 65557);
  for (let i = buffer.length - 22; i >= minPos; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);

  for (let i = 0; i < entryCount; i++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const commentLen = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLen);

    if (name === entryName) {
      const lhNameLen = buffer.readUInt16LE(localOffset + 26);
      const lhExtraLen = buffer.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + lhNameLen + lhExtraLen;
      const raw = buffer.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) return Buffer.from(raw);
      if (method === 8) return inflateRawSync(raw);
      return null;
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

/** 文本解码：UTF-8 优先，出现替换符（乱码）时回退 GBK */
export function decodeText(buffer: Buffer): string {
  let text = new TextDecoder('utf-8').decode(buffer);
  if (text.includes('\uFFFD')) {
    try {
      const gbk = new TextDecoder('gbk').decode(buffer);
      if (!gbk.includes('\uFFFD')) text = gbk;
    } catch {
      /* 环境不支持 GBK 时保持 UTF-8 */
    }
  }
  return text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
}

// ============ Word (.docx) ============

export function docxToText(buffer: Buffer): string {
  const xml = readZipEntry(buffer, 'word/document.xml');
  if (!xml) {
    throw new Error('无法读取 Word 内容：请确认文件为 .docx 格式（旧版 .doc 请先另存为 .docx）');
  }
  const content = xml.toString('utf8');
  const paragraphs = content
    .split(/<\/w:p>/)
    .map((p) => {
      const parts: string[] = [];
      const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(p))) {
        if (m[0].startsWith('<w:t')) parts.push(m[1] ?? '');
        else parts.push(' ');
      }
      return decodeXmlEntities(parts.join('')).trim();
    })
    .filter((p) => p.length > 0);
  return paragraphs.join('\n');
}

// ============ Excel (.xlsx) ============

export function xlsxToRows(buffer: Buffer): string[][] {
  const sharedRaw = readZipEntry(buffer, 'xl/sharedStrings.xml');
  const shared: string[] = [];
  if (sharedRaw) {
    const xml = sharedRaw.toString('utf8');
    const siRe = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si\/>/g;
    let m: RegExpExecArray | null;
    while ((m = siRe.exec(xml))) {
      const inner = m[1] ?? '';
      const ts: string[] = [];
      const tRe = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
      let t: RegExpExecArray | null;
      while ((t = tRe.exec(inner))) ts.push(t[1] ?? '');
      shared.push(decodeXmlEntities(ts.join('')));
    }
  }

  const sheetBuf = readZipEntry(buffer, 'xl/worksheets/sheet1.xml');
  if (!sheetBuf) {
    throw new Error('无法读取 Excel 工作表：请确认文件为 .xlsx 格式（旧版 .xls 请先另存为 .xlsx）');
  }
  const sheetXml = sheetBuf.toString('utf8');

  const rows: string[][] = [];
  const rowRe = /<row[^>]*?>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(sheetXml))) {
    const cells: (string | undefined)[] = [];
    const cellRe = /<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(rm[1]))) {
      const attrs = cm[1] ?? '';
      const inner = cm[2] ?? '';
      const refMatch = /r="([A-Z]+)\d+"/.exec(attrs);
      const colIdx = refMatch ? colLettersToIndex(refMatch[1]) : cells.length;
      const type = /t="(\w+)"/.exec(attrs)?.[1];
      let value = '';
      if (type === 'inlineStr') {
        const ts: string[] = [];
        const tRe = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
        let t: RegExpExecArray | null;
        while ((t = tRe.exec(inner))) ts.push(t[1] ?? '');
        value = ts.join('');
      } else {
        const v = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        if (v !== undefined) {
          value = type === 's' ? (shared[Number(v)] ?? '') : v;
        }
      }
      cells[colIdx] = decodeXmlEntities(value).trim();
    }
    const row: string[] = [];
    for (let i = 0; i < cells.length; i++) row[i] = cells[i] ?? '';
    if (row.some((c) => c !== '')) rows.push(row);
  }
  return rows;
}

// ============ CSV ============

export function csvToRows(text: string, delimiter?: string): string[][] {
  const delim = delimiter ?? sniffDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field.trim());
      field = '';
    } else if (ch === '\n') {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field !== '' || row.length) {
    row.push(field.trim());
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ''));
}

function sniffDelimiter(text: string): string {
  const line = text.split('\n', 1)[0] ?? '';
  const counts: [string, number][] = [
    [',', (line.match(/,/g) ?? []).length],
    ['\t', (line.match(/\t/g) ?? []).length],
    [';', (line.match(/;/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

// ============ 题目字段识别与规范化 ============

const OPTION_RE = /^([A-Za-z])\s*[.、．:：)）]\s*(.*)$/;
const QUESTION_NUM_RE = /^(?:第\s*(\d+)\s*题|[（(]?(\d+)\s*[)）]?\s*[.、．:：]|[（(](\d+)[)）])\s*(.*)$/;

/**
 * 行内多选项识别："A. ps B. top C. ls D. pwd"、"(A) df -h (B) du -sh"。
 * 仅当标记构成字母递增序列（A→B→C…，允许跳号）时才认定为选项，
 * 避免把正文里的"A."之类噪音误切。
 */
function parseInlineOptions(
  line: string,
): { title: string; options: { key: string; text: string }[] } | null {
  if (!line) return null;
  const MARK_RE = /(?:^|[\s　(（])([A-Za-z])\s*[.、．:：)）]\s*/g;
  const marks: { key: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = MARK_RE.exec(line))) {
    marks.push({ key: m[1].toUpperCase(), start: m.index, end: m.index + m[0].length });
  }
  if (marks.length < 2) return null;

  // 过滤出递增子序列
  const seq: typeof marks = [];
  for (const mark of marks) {
    const code = mark.key.charCodeAt(0);
    const last = seq.length ? seq[seq.length - 1].key.charCodeAt(0) : null;
    if (last === null || code > last) {
      seq.push(mark);
    } else if (seq.length >= 2) {
      break; // 已有成对序列，后续乱序标记丢弃
    } else {
      seq.length = 0;
      seq.push(mark); // 重新起序列
    }
  }
  if (seq.length < 2) return null;

  const title = line.slice(0, seq[0].start).trim();
  const options = seq.map((mark, i) => ({
    key: mark.key,
    text: line.slice(mark.end, i + 1 < seq.length ? seq[i + 1].start : line.length).trim(),
  }));
  return { title, options };
}

const ANSWER_RE = /^[【\[]?\s*(?:正确答案|参考答案|标准答案|答案)\s*】?\]?[:：]?\s*(.*)$/;
const EXPLAIN_RE = /^[【\[]?\s*(?:解析|解答|说明)\s*】?\]?[:：]?\s*(.*)$/;
const POINT_RE = /^[【\[]?\s*(?:考点|知识点)\s*】?\]?[:：]?\s*(.*)$/;
const CATEGORY_RE = /^[【\[]?\s*(?:分类|类别)\s*】?\]?[:：]?\s*(.*)$/;
const DIFFICULTY_RE = /^[【\[]?\s*难度\s*】?\]?[:：]?\s*(.*)$/;
const TAGS_RE = /^[【\[]?\s*标签\s*】?\]?[:：]?\s*(.*)$/;
const TYPE_RE = /^[【\[]?\s*题型\s*】?\]?[:：]?\s*(.*)$/;
const SOURCE_RE = /^[【\[]?\s*来源\s*】?\]?[:：]?\s*(.*)$/;

const TRUE_SET = new Set(['对', '正确', '√', '✓', 'true', 't', '是', 'yes', 'y', '1']);
const FALSE_SET = new Set(['错', '错误', '×', 'x', '✗', 'false', 'f', '否', 'no', 'n', '0']);

function normalizeType(raw: string | undefined): QuestionTypeValue | undefined {
  if (!raw) return undefined;
  const s = raw.trim().toLowerCase();
  if (/单选|single/.test(s)) return 'single_choice';
  if (/多选|multiple/.test(s)) return 'multiple_choice';
  if (/判断|是非|true_false|true\/false/.test(s)) return 'true_false';
  if (/填空|fill/.test(s)) return 'fill_blank';
  if (/简答|问答|论述|short/.test(s)) return 'short_answer';
  return undefined;
}

function normalizeDifficulty(raw: string | undefined): DifficultyValue {
  if (!raw) return 'medium';
  const s = raw.trim().toLowerCase();
  if (/简单|容易|easy|低|易|^[12]$/.test(s)) return 'easy';
  if (/困难|较难|hard|高|难|^[45]$/.test(s)) return 'hard';
  return 'medium';
}

function extractOptionKeys(raw: string | undefined): string[] {
  if (!raw) return [];
  const keys: string[] = [];
  for (const ch of raw.toUpperCase()) {
    if (ch >= 'A' && ch <= 'Z' && !keys.includes(ch)) keys.push(ch);
  }
  return keys;
}

function isJudgeText(raw: string | undefined): boolean {
  if (!raw) return false;
  return TRUE_SET.has(raw.trim().toLowerCase()) || FALSE_SET.has(raw.trim().toLowerCase());
}

function judgeToBool(raw: string): boolean {
  return TRUE_SET.has(raw.trim().toLowerCase());
}

function splitList(raw: string): string[] {
  return raw
    .split(/[,，、;；|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

interface NormalizedAnswer {
  answer: unknown;
  problem?: string;
}

/** 按题型把原始答案文本规范化为库内格式 */
function normalizeAnswer(
  type: QuestionTypeValue,
  raw: string,
  options: { key: string; text: string }[],
): NormalizedAnswer {
  const trimmed = raw.trim();
  if (!trimmed) return { answer: null, problem: '缺少答案' };

  if (type === 'single_choice') {
    const keys = extractOptionKeys(trimmed);
    if (keys.length === 0) return { answer: null, problem: `答案“${trimmed}”中未识别到选项字母` };
    if (keys.length > 1) return { answer: keys[0], problem: '单选题答案应只含一个选项字母' };
    if (options.length && !options.some((o) => o.key === keys[0])) {
      return { answer: keys[0], problem: `答案 ${keys[0]} 不在选项中` };
    }
    return { answer: keys[0] };
  }
  if (type === 'multiple_choice') {
    const keys = extractOptionKeys(trimmed);
    if (keys.length === 0) return { answer: null, problem: `答案“${trimmed}”中未识别到选项字母` };
    if (keys.length < 2) return { answer: keys, problem: '多选题答案应包含至少两个选项字母' };
    const missing = keys.filter((k) => options.length && !options.some((o) => o.key === k));
    if (missing.length) return { answer: keys, problem: `答案选项 ${missing.join('')} 不在选项中` };
    return { answer: keys };
  }
  if (type === 'true_false') {
    if (!isJudgeText(trimmed)) return { answer: null, problem: '判断题答案应为 对/错/正确/错误/√/×' };
    return { answer: judgeToBool(trimmed) };
  }
  if (type === 'fill_blank') {
    const parts = trimmed.split(/[;；|]/).map((s) => s.trim()).filter(Boolean);
    return { answer: parts.length ? parts : [trimmed] };
  }
  return { answer: trimmed };
}

function emptyQuestion(): ParsedQuestion {
  return {
    title: '',
    type: 'single_choice',
    difficulty: 'medium',
    options: [],
    answer: null,
    explanation: '',
    knowledgePoint: '',
    categoryName: '',
    tags: [],
    source: '',
    valid: false,
  };
}

/** 组装题目：类型推断 + 答案规范化 + 校验标记 */
function buildQuestion(input: {
  title: string;
  options: { key: string; text: string }[];
  rawAnswer?: string;
  rawType?: string;
  rawDifficulty?: string;
  explanation?: string;
  knowledgePoint?: string;
  categoryName?: string;
  tags?: string[];
  source?: string;
}): ParsedQuestion {
  const q = emptyQuestion();
  q.title = input.title;
  q.options = input.options.filter((o) => o.key || o.text);
  q.explanation = input.explanation ?? '';
  q.knowledgePoint = input.knowledgePoint ?? '';
  q.categoryName = input.categoryName ?? '';
  q.tags = input.tags ?? [];
  q.source = input.source ?? '';
  q.difficulty = normalizeDifficulty(input.rawDifficulty);

  // 类型：显式题型 > 选项/答案推断
  let type = normalizeType(input.rawType);
  if (!type) {
    if (input.options.length >= 2) {
      const keys = extractOptionKeys(input.rawAnswer);
      type = keys.length > 1 ? 'multiple_choice' : 'single_choice';
    } else if (isJudgeText(input.rawAnswer)) {
      type = 'true_false';
    } else if (/_{2,}|（\s*）|\(\s*\)|____/.test(input.title)) {
      type = 'fill_blank';
    } else {
      type = 'short_answer';
    }
  }
  q.type = type;

  const { answer, problem } = normalizeAnswer(type, input.rawAnswer ?? '', q.options);
  q.answer = answer;
  q.problem = problem;

  // 通用校验
  if (!q.title) q.problem = q.problem ?? '缺少题干';
  if ((type === 'single_choice' || type === 'multiple_choice') && q.options.length < 2) {
    q.problem = q.problem ?? '选择题至少需要两个选项';
  }
  q.valid = !q.problem;
  return q;
}

// ============ 文本解析（txt / md / docx 提取的文本） ============

interface Draft {
  titleLines: string[];
  options: { key: string; text: string }[];
  rawAnswer?: string;
  rawType?: string;
  rawDifficulty?: string;
  explanation: string[];
  knowledgePoint?: string;
  categoryName?: string;
  tags?: string[];
  source?: string;
  afterAnswer: boolean;
}

export function parseQuestionsFromText(text: string): ParseResult {
  const questions: ParsedQuestion[] = [];
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l !== '');

  let cur: Draft | null = null;
  let seq = 0;

  const flush = () => {
    if (!cur) return;
    seq += 1;
    const title = cur.titleLines.join('\n').trim();
    questions.push(
      buildQuestion({
        title,
        options: cur.options,
        rawAnswer: cur.rawAnswer,
        rawType: cur.rawType,
        rawDifficulty: cur.rawDifficulty,
        explanation: cur.explanation.join('\n').trim(),
        knowledgePoint: cur.knowledgePoint,
        categoryName: cur.categoryName,
        tags: cur.tags,
        source: cur.source,
      }),
    );
    if (!title) questions[questions.length - 1].problem = '缺少题干';
    cur = null;
  };

  for (const line of lines) {
    const qm = QUESTION_NUM_RE.exec(line);
    const om = OPTION_RE.exec(line);

    // 新题开始：题号行（行首是字母选项标记时不视为题号）
    if (qm && !(om && om.index === 0)) {
      flush();
      cur = {
        titleLines: [],
        options: [],
        explanation: [],
        afterAnswer: false,
      };
      // 题号之后可能直接跟选项："1. 题干 A.x B.y"
      const rest = (qm[4] ?? '').trim();
      const inline = parseInlineOptions(rest);
      if (inline && inline.options.length >= 2) {
        if (inline.title) cur.titleLines.push(inline.title);
        cur.options.push(...inline.options);
      } else if (rest) {
        cur.titleLines.push(rest);
      }
      continue;
    }

    if (!cur) continue; // 题目区之前的说明文字忽略

    let m: RegExpExecArray | null;
    if ((m = ANSWER_RE.exec(line))) {
      cur.rawAnswer = (m[1] ?? '').trim();
      cur.afterAnswer = true;
      continue;
    }
    if ((m = EXPLAIN_RE.exec(line))) {
      cur.explanation = [(m[1] ?? '').trim()];
      continue;
    }
    if ((m = POINT_RE.exec(line))) {
      cur.knowledgePoint = (m[1] ?? '').trim();
      continue;
    }
    if ((m = CATEGORY_RE.exec(line))) {
      cur.categoryName = (m[1] ?? '').trim();
      continue;
    }
    if ((m = DIFFICULTY_RE.exec(line))) {
      cur.rawDifficulty = (m[1] ?? '').trim();
      continue;
    }
    if ((m = TAGS_RE.exec(line))) {
      cur.tags = splitList(m[1] ?? '');
      continue;
    }
    if ((m = TYPE_RE.exec(line))) {
      cur.rawType = (m[1] ?? '').trim();
      continue;
    }
    if ((m = SOURCE_RE.exec(line))) {
      cur.source = (m[1] ?? '').trim();
      continue;
    }

    // 一行内多个选项："A. ps B. top C. ls D. pwd" / "(A) df -h (B) du -sh"
    const inline = parseInlineOptions(line);
    if (inline && inline.options.length >= 2) {
      if (inline.title && !cur.options.length) {
        cur.titleLines.push(inline.title);
      }
      cur.options.push(...inline.options);
      continue;
    }

    if (om) {
      cur.options.push({ key: om[1].toUpperCase(), text: (om[2] ?? '').trim() });
      continue;
    }

    // 续行：答案后的文字并入解析；选项后接排文字并入上一选项；否则并入题干
    if (cur.afterAnswer) {
      cur.explanation.push(line);
    } else if (cur.options.length) {
      const last = cur.options[cur.options.length - 1];
      last.text = `${last.text} ${line}`.trim();
    } else {
      cur.titleLines.push(line);
    }
  }
  flush();

  const errors: string[] = [];
  if (!questions.length) errors.push('未识别到任何题目：请检查格式（题干以“1.”等编号开头，选项以“A.”开头，答案行以“答案：”开头）');
  return { questions, errors };
}

// ============ 表格解析（Excel / CSV） ============

interface ColMap {
  title?: number;
  type?: number;
  difficulty?: number;
  answer?: number;
  explanation?: number;
  knowledgePoint?: number;
  categoryName?: number;
  tags?: number;
  source?: number;
  optionCols: Record<string, number>;
}

function mapHeader(header: string[]): ColMap | null {
  const map: ColMap = { optionCols: {} };
  header.forEach((h, i) => {
    const s = h.trim();
    if (!s) return;
    const opt = /^(?:选项)?\s*([A-Za-z])\s*$/.exec(s);
    if (opt) {
      map.optionCols[opt[1].toUpperCase()] = i;
      return;
    }
    if (map.title === undefined && /(题干|题目|问题|试题|question)/i.test(s)) map.title = i;
    else if (map.type === undefined && /(题型|类型)/.test(s)) map.type = i;
    else if (map.difficulty === undefined && /难度/.test(s)) map.difficulty = i;
    else if (map.answer === undefined && /答案/.test(s)) map.answer = i;
    else if (map.explanation === undefined && /(解析|解答|说明)/.test(s)) map.explanation = i;
    else if (map.knowledgePoint === undefined && /(考点|知识点)/.test(s)) map.knowledgePoint = i;
    else if (map.categoryName === undefined && /(分类|类别)/.test(s)) map.categoryName = i;
    else if (map.tags === undefined && /标签/.test(s)) map.tags = i;
    else if (map.source === undefined && /来源/.test(s)) map.source = i;
  });
  return map.title !== undefined ? map : null;
}

export function parseQuestionsFromRows(rows: string[][]): ParseResult {
  const errors: string[] = [];
  if (!rows.length) return { questions: [], errors: ['表格内容为空'] };

  // 在前 5 行内识别表头
  let headerIdx = -1;
  let colMap: ColMap | null = null;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const m = mapHeader(rows[i]);
    if (m) {
      headerIdx = i;
      colMap = m;
      break;
    }
  }

  // 没有标准表头：按行拼接文本，走文本解析兜底
  if (!colMap) {
    const text = rows.map((r) => r.filter((c) => c !== '').join(' ')).join('\n');
    const result = parseQuestionsFromText(text);
    if (!result.questions.length) {
      errors.push('未识别到表头（需包含“题干”列），也无法按文本格式解析题目');
    }
    return result;
  }

  const questions: ParsedQuestion[] = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const cell = (idx?: number) => (idx === undefined ? '' : (row[idx] ?? '').trim());
    const title = cell(colMap.title);
    if (!title) continue;

    const optionLetters = Object.keys(colMap.optionCols).sort();
    const options = optionLetters
      .map((k) => ({ key: k, text: cell(colMap!.optionCols[k]) }))
      .filter((o) => o.text !== '');

    questions.push(
      buildQuestion({
        title,
        options,
        rawAnswer: cell(colMap.answer),
        rawType: cell(colMap.type),
        rawDifficulty: cell(colMap.difficulty),
        explanation: cell(colMap.explanation),
        knowledgePoint: cell(colMap.knowledgePoint),
        categoryName: cell(colMap.categoryName),
        tags: cell(colMap.tags) ? splitList(cell(colMap.tags)) : undefined,
        source: cell(colMap.source),
      }),
    );
  }

  if (!questions.length) errors.push('表头之下没有数据行');
  return { questions, errors };
}

// ============ 文件分发入口 ============

export function parseImportFile(filename: string, buffer: Buffer): ParseResult {
  const ext = (filename.toLowerCase().split('.').pop() ?? '').trim();
  try {
    switch (ext) {
      case 'docx':
        return parseQuestionsFromText(docxToText(buffer));
      case 'xlsx':
      case 'xlsm':
        return parseQuestionsFromRows(xlsxToRows(buffer));
      case 'csv':
        return parseQuestionsFromRows(csvToRows(decodeText(buffer)));
      case 'txt':
      case 'md':
      case 'markdown':
        return parseQuestionsFromText(decodeText(buffer));
      default:
        return parseQuestionsFromText(decodeText(buffer));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { questions: [], errors: [message] };
  }
}
