/**
 * 导入解析器自测：用内置 ZIP 写入器构造符合 OOXML 规范的 .docx / .xlsx，
 * 连同 .csv / .txt 一起走 parseImportFile 全流程。
 * 运行：先 pnpm run build，再 node scripts/test-import.mjs
 */
import { deflateRawSync } from 'node:zlib';
import { parseImportFile } from '../dist/import-parser.js';

/** 最小 ZIP 写入器（deflate），供构造 docx/xlsx 测试样本 */
function zipCreate(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const compressed = deflateRawSync(e.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // method = deflate
    local.writeUInt32LE(0, 10); // mod time + date
    local.writeUInt32LE(0, 14); // crc32（解析器不校验）
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuf, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuf);
    offset += 30 + nameBuf.length + compressed.length;
  }
  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralBuf, eocd]);
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------- 构造 .docx ----------
const docParas = [
  '1. 以下哪个命令用于查看当前系统的进程快照？',
  'A. ps', 'B. top', 'C. ls', 'D. pwd',
  '答案：A',
  '解析：ps 输出当前进程快照。',
  '考点：进程管理',
  '难度：简单',
  '分类：Linux 系统',
  '',
  '2. kill -9 发送的 SIGKILL 信号可以被进程捕获并忽略。',
  '答案：错误',
  '解析：SIGKILL 不能被捕获或忽略。',
  '',
  '3. 显示当前内核版本信息的命令是（填写命令，可带参数）：____',
  '答案：uname -r',
  '',
  '4. 以下哪些命令可以观察系统 CPU 使用情况？（多选）',
  'A. top', 'B. vmstat', 'C. ls', 'D. mpstat',
  '答案：ABD',
  '解析：top/vmstat/mpstat 都可用于观察 CPU。',
  '标签：生产经验,故障排查',
];
const docxXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
${docParas.map((t) => (t ? `<w:p><w:r><w:t>${esc(t)}</w:t></w:r></w:p>` : '<w:p/>')).join('\n')}
</w:body></w:document>`;
const docxBuffer = zipCreate([{ name: 'word/document.xml', data: Buffer.from(docxXml, 'utf8') }]);

// ---------- 构造 .xlsx ----------
const header = ['题干', '题型', '难度', '选项A', '选项B', '选项C', '选项D', '答案', '解析', '考点', '分类', '标签'];
const dataRows = [
  ['把文件权限设置为 rwxr-xr-x，对应的数字模式是？', '单选', '简单', '755', '644', '777', '700', 'A', 'rwx=7，rx=5，rx=5', '文件权限', 'Linux 系统', '基础概念,面试高频'],
  ['某服务报「address already in use」，最可能的原因是？', '填空', '中等', '', '', '', '', '端口被占用', 'netstat/lsof 检查端口占用', '端口排查', 'Linux 系统', '故障排查'],
  ['以下哪些信号可以被进程自定义捕获？（多选）', '多选', '困难', 'SIGTERM', 'SIGKILL', 'SIGINT', 'SIGHUP', 'ACD', 'SIGKILL/SIGSTOP 不可捕获', '信号机制', 'Linux 系统', '面试高频'],
];
const strings = [...header, ...dataRows.flat()];
const sstXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">
${strings.map((s) => `<si><t>${esc(s)}</t></si>`).join('\n')}
</sst>`;
const colLetter = (i) => String.fromCharCode(65 + i);
const sheetRows = [header, ...dataRows]
  .map((row, r) => {
    const cells = row
      .map((v, c) => {
        const si = strings.indexOf(v);
        return `<c r="${colLetter(c)}${r + 1}" t="s"><v>${si}</v></c>`;
      })
      .join('');
    return `<row r="${r + 1}">${cells}</row>`;
  })
  .join('\n');
const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
${sheetRows}
</sheetData></worksheet>`;
const xlsxBuffer = zipCreate([
  { name: 'xl/sharedStrings.xml', data: Buffer.from(sstXml, 'utf8') },
  { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheetXml, 'utf8') },
]);

// ---------- csv / txt ----------
const csvText = [
  '题干,题型,难度,选项A,选项B,选项C,选项D,答案,考点,分类',
  '查看磁盘分区整体使用情况的命令是？,单选,简单,"df -h","du -sh",lsblk,fdisk,A,磁盘管理,Linux 系统',
  '把文件权限设置为 rwxr-xr-x，对应的数字模式是？,单选,简单,755,644,777,700,B,文件权限,Linux 系统',
].join('\n');

const txtText = [
  '一、单项选择题',
  '1. 在文件中查找包含某个关键字的行，应使用哪个命令？',
  'A. grep', 'B. find', 'C. locate', 'D. awk',
  '答案：A',
  '解析：grep 用于文本搜索。',
  '',
  '2. 一个进程已结束但仍在进程表中占用 PID、无法回收，这种进程称为____进程。',
  '答案：僵尸',
  '考点：进程状态',
  '',
  '3. 以下哪些属于进程间通信方式？ A. 管道 B. 信号量 C. cd 命令 D. 共享内存',
  '答案：ABD',
  '',
  '4. 查看磁盘使用情况的命令是？(A) df -h (B) du -sh (C) free -m (D) uptime',
  '答案：A',
].join('\n');

// ---------- 运行 ----------
const label = (r) =>
  r.questions
    .map(
      (q, i) =>
        `  #${i + 1} [${q.valid ? '✓' : '✗'}] ${q.type}/${q.difficulty} 答案=${JSON.stringify(q.answer)}` +
        `${q.problem ? ' 问题:' + q.problem : ''} | ${q.title.slice(0, 24)}…` +
        `${q.categoryName ? ' 分类:' + q.categoryName : ''}${q.tags?.length ? ' 标签:' + q.tags.join(',') : ''}`,
    )
    .join('\n');

let failed = false;
function check(name, result, expectValid) {
  const validCount = result.questions.filter((q) => q.valid).length;
  const pass = validCount === expectValid && result.errors.length === 0;
  if (!pass) failed = true;
  console.log(`\n=== ${name}：有效 ${validCount}/${result.questions.length} 题（期望 ${expectValid}）${pass ? ' ✓' : ' ✗'} ===`);
  console.log(label(result) || '  （无题目）');
  if (result.errors.length) console.log('  errors:', result.errors);
}

check('Word (.docx)', parseImportFile('题目.docx', docxBuffer), 4);
check('Excel (.xlsx)', parseImportFile('题库.xlsx', xlsxBuffer), 3);
check('CSV (.csv)', parseImportFile('题库.csv', Buffer.from(csvText, 'utf8')), 2);
check('Text (.txt)', parseImportFile('题库.txt', Buffer.from(txtText, 'utf8')), 4);

process.exit(failed ? 1 : 0);
