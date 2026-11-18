/**
 * 导入接口端到端测试：登录 → 解析文件 → 确认导入 → 查库验证 → 清理
 * 运行：node scripts/test-import-api.mjs
 */
import { deflateRawSync } from 'node:zlib';

const BASE = 'http://localhost:4000/api';

function zipCreate(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const compressed = deflateRawSync(e.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(0, 14);
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
const paras = [
  '1. 端到端测试：以下哪个命令用于查看进程快照？',
  'A. ps', 'B. top', 'C. ls', 'D. pwd',
  '答案：A',
  '解析：ps 输出进程快照。',
  '分类：导入测试分类',
  '标签：e2e测试',
];
const docxBuffer = zipCreate([
  {
    name: 'word/document.xml',
    data: Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras
        .map((t) => `<w:p><w:r><w:t>${esc(t)}</w:t></w:r></w:p>`)
        .join('')}</w:body></w:document>`,
      'utf8',
    ),
  },
]);

async function apiCall(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

let failed = false;
const expect = (cond, msg) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failed = true;
};

// 1. 登录
const login = await apiCall('/auth/login', {
  method: 'POST',
  body: { account: 'admin', password: 'admin123' },
});
expect(login.status === 200, '管理员登录');
const token = login.json.token;

// 2. 解析 docx
const parse = await apiCall('/questions/import/parse', {
  method: 'POST',
  token,
  body: {
    filename: 'e2e-导入.docx',
    contentBase64: docxBuffer.toString('base64'),
  },
});
expect(parse.status === 200, `解析接口返回 200（实际 ${parse.status}）`);
expect(parse.json.data?.length === 1, `解析出 1 道题（实际 ${parse.json.data?.length}）`);
expect(parse.json.data?.[0]?.valid === true, '解析结果有效');
expect(parse.json.data?.[0]?.answer === 'A', `答案规范化为 "A"（实际 ${JSON.stringify(parse.json.data?.[0]?.answer)}）`);

// 3. 确认导入
const commit = await apiCall('/questions/import', {
  method: 'POST',
  token,
  body: { questions: parse.json.data.filter((q) => q.valid) },
});
expect(commit.status === 200, `导入接口返回 200（实际 ${commit.status}）`);
expect(commit.json.imported === 1, `成功导入 1 题（实际 ${commit.json.imported}）`);

// 4. 查库验证（标题搜索）
const list = await apiCall('/questions?q=' + encodeURIComponent('端到端测试'), { token });
const found = list.json.data?.find((q) => q.title.includes('端到端测试'));
expect(!!found, '导入的题目可在题库中检索到');
expect(found?.tags?.some((t) => t.name === 'e2e测试'), '标签已关联');
expect(found?.categoryName === '导入测试分类', '分类已自动创建并关联');

// 5. 非管理员应被拒绝
const demoLogin = await apiCall('/auth/login', {
  method: 'POST',
  body: { account: 'demo', password: 'demo123' },
});
const denied = await apiCall('/questions/import', {
  method: 'POST',
  token: demoLogin.json.token,
  body: { questions: [] },
});
expect(denied.status === 403 || denied.status === 401, `普通用户被拒绝（实际 ${denied.status}）`);

// 6. 清理测试数据（物理删除，无练习引用）
if (found) {
  const del = await apiCall(`/questions/${found.id}`, { method: 'DELETE', token });
  expect(del.status === 200, '清理测试题目');
}
// 清理自动创建的分类
const cats = await apiCall('/categories', { token });
const testCat = cats.json.data?.find((c) => c.name === '导入测试分类');
if (testCat) {
  const delCat = await apiCall(`/categories/${testCat.id}`, { method: 'DELETE', token });
  expect(delCat.status === 200 || delCat.status === 400, `清理测试分类（${delCat.status}）`);
}

process.exit(failed ? 1 : 0);
