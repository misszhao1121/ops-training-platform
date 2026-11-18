/**
 * 导入归属行业验证：导入带新分类的题目到指定行业下，验证分类挂载，随后清理。
 * 运行：node scripts/test-import-industry.mjs
 */
const BASE = 'http://localhost:4000/api';

async function apiCall(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

let failed = false;
const expect = (cond, msg) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failed = true;
};

const login = await apiCall('/auth/login', { method: 'POST', body: { account: 'admin', password: 'admin123' } });
const token = login.json.token;

const txt = [
  '1. 行业导入测试：压疮预防中翻身的最佳频率是？',
  'A. 每 1～2 小时一次',
  'B. 每 8 小时一次',
  'C. 每天一次',
  'D. 无需翻身',
  '答案：A',
  '分类：翻身护理',
].join('\n');

const catsBefore = await apiCall('/categories', { token });
const nursing = catsBefore.json.data.find((c) => c.name === '护理');
expect(!!nursing, '行业「护理」存在');

const parse = await apiCall('/questions/import/parse', {
  method: 'POST',
  token,
  body: { filename: '行业测试.txt', contentBase64: Buffer.from(txt, 'utf8').toString('base64') },
});
expect(parse.status === 200 && parse.json.data?.[0]?.valid === true, 'txt 解析有效');

const commit = await apiCall('/questions/import', {
  method: 'POST',
  token,
  body: { industryId: nursing.id, questions: parse.json.data.filter((q) => q.valid) },
});
expect(commit.json.imported === 1, `导入 1 题（实际 ${commit.json.imported}）`);

const catsAfter = await apiCall('/categories', { token });
const nursingAfter = catsAfter.json.data.find((c) => c.name === '护理');
const newCat = (nursingAfter.children ?? []).find((c) => c.name === '翻身护理');
expect(!!newCat, '新分类「翻身护理」已挂到护理行业下');

// 清理
const list = await apiCall('/questions?q=' + encodeURIComponent('行业导入测试'), { token });
const q = list.json.data?.[0];
if (q) {
  const del = await apiCall(`/questions/${q.id}`, { method: 'DELETE', token });
  expect(del.status === 200, '清理测试题目');
}
const delCat = await apiCall(`/categories/${newCat.id}`, { method: 'DELETE', token });
expect(delCat.status === 200, '清理测试分类');

process.exit(failed ? 1 : 0);
