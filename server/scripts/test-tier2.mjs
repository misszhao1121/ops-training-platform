/**
 * 第二档功能端到端测试：改密码 / 面试全流程 / 自适应练习 / 考点组卷
 * 运行：node scripts/test-tier2.mjs
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

// 注册一个专用测试用户（避免污染演示账号密码）
const uniq = `t2_${Date.now() % 100000}`;
const reg = await apiCall('/auth/register', {
  method: 'POST',
  body: { email: `${uniq}@test.local`, username: uniq, password: 'test123' },
});
expect(reg.status === 201, `注册测试用户 ${uniq}`);
const T = reg.json.token;
const userId = reg.json.user.id;

// ===== 改密码 =====
const badOld = await apiCall('/auth/password', {
  method: 'POST',
  token: T,
  body: { oldPassword: 'wrong-password', newPassword: 'newpass456' },
});
expect(badOld.status === 400, `原密码错误被拒绝（${badOld.status}）`);
const okPwd = await apiCall('/auth/password', {
  method: 'POST',
  token: T,
  body: { oldPassword: 'test123', newPassword: 'newpass456' },
});
expect(okPwd.status === 200, '修改密码成功');
const reLogin = await apiCall('/auth/login', {
  method: 'POST',
  body: { account: uniq, password: 'newpass456' },
});
expect(reLogin.status === 200, '新密码可登录');

// ===== 面试全流程 =====
const topics = await apiCall('/interview/topics', { token: T });
expect(topics.json.data.length > 0, `面试主题 ${topics.json.data.length} 个`);

const iv = await apiCall('/interview/sessions', {
  method: 'POST',
  token: T,
  body: { count: 3, topic: '端到端面试' },
});
expect(iv.status === 201, `创建面试（${iv.status}），题目 ${iv.json.data.questions?.length} 道`);
const sid = iv.json.data.id;

// 逐题作答（一半参考答案方向、一半随意）
let answered = 0;
for (const q of iv.json.data.questions) {
  const detail = await apiCall(`/questions/${q.id}`, { token: T });
  const ref = detail.json.data.explanation ?? String(detail.json.data.answer ?? '');
  const answer = answered % 2 === 0 ? ref.slice(0, 200) || '相关要点阐述' : '完全无关的回答';
  const r = await apiCall(`/interview/sessions/${sid}/answer`, {
    method: 'POST',
    token: T,
    body: { questionId: q.id, answer },
  });
  expect(r.status === 200 && typeof r.json.data.score === 'number', `第 ${answered + 1} 题评分 ${r.json.data.score} 分`);
  answered += 1;
}
// 重复提交同一题应覆盖而非报错
const again = await apiCall(`/interview/sessions/${sid}/answer`, {
  method: 'POST',
  token: T,
  body: { questionId: iv.json.data.questions[0].id, answer: '改进后的回答' },
});
expect(again.status === 200, '重复作答覆盖成功');

const fin = await apiCall(`/interview/sessions/${sid}/finish`, { method: 'POST', token: T });
expect(fin.status === 200, '结束面试生成报告');
expect(fin.json.data.score !== null, `面试总分 ${fin.json.data.score}`);
expect(!!fin.json.data.feedback?.level, `等级评价：${fin.json.data.feedback.level}`);
expect(Array.isArray(fin.json.data.feedback?.details), '逐题回顾数据');
expect(fin.json.data.questions[0]?.referenceAnswer !== undefined, '报告暴露参考答案');

// ===== 自适应练习 =====
const ad = await apiCall('/practice/attempts', {
  method: 'POST',
  token: T,
  body: { mode: 'adaptive', filters: {} },
});
expect(ad.status === 201 && ad.json.data.items.length === 0, '创建自适应练习（空题池）');

// 第一题
const n1 = await apiCall(`/practice/attempts/${ad.json.data.id}/next`, {
  method: 'POST',
  token: T,
  body: { difficulty: 'easy' },
});
expect(n1.status === 200, `追加第 1 题（难度 ${n1.json.data.question.difficulty}）`);
// 答对 → 应能继续追加
const q1 = n1.json.data.question;
const a1 = await apiCall(`/practice/attempts/${ad.json.data.id}/answer`, {
  method: 'POST',
  token: T,
  body: { questionId: q1.id, answer: '任意' },
});
expect('isCorrect' in a1.json.data, '自适应模式即时反馈');
const n2 = await apiCall(`/practice/attempts/${ad.json.data.id}/next`, {
  method: 'POST',
  token: T,
  body: { difficulty: 'easy' },
});
expect(n2.status === 200, `追加第 2 题（难度 ${n2.json.data.question.difficulty}）`);
expect(n2.json.data.question.id !== q1.id, '追加题目不重复');
const detail2 = await apiCall(`/practice/attempts/${ad.json.data.id}`, { token: T });
expect(detail2.json.data.total === 2, '题数动态增长');
// 交卷
const subAd = await apiCall(`/practice/attempts/${ad.json.data.id}/submit`, { method: 'POST', token: T });
expect(subAd.status === 200, '自适应练习交卷出分');
// 已交卷后 next 应拒绝
const nAfter = await apiCall(`/practice/attempts/${ad.json.data.id}/next`, {
  method: 'POST',
  token: T,
  body: {},
});
expect(nAfter.status === 400, '交卷后追加被拒绝');
// 普通练习调用 next 应拒绝
const normal = await apiCall('/practice/attempts', {
  method: 'POST',
  token: T,
  body: { mode: 'practice', count: 1 },
});
const nOnNormal = await apiCall(`/practice/attempts/${normal.json.data.id}/next`, {
  method: 'POST',
  token: T,
  body: {},
});
expect(nOnNormal.status === 400, '非自适应练习调用 next 被拒绝');

// ===== 考点组卷 =====
const kps = await apiCall('/questions/knowledge-points', { token: T });
expect(kps.json.data.length > 0, `考点列表 ${kps.json.data.length} 个`);
const kpName = kps.json.data[0].name;
const byKp = await apiCall('/practice/available?knowledgePoints=' + encodeURIComponent(kpName), { token: T });
expect(byKp.json.data.available > 0, `按考点「${kpName}」可用 ${byKp.json.data.available} 题`);
const paper = await apiCall('/practice/attempts', {
  method: 'POST',
  token: T,
  body: { mode: 'exam', count: Math.min(3, byKp.json.data.available), filters: { knowledgePoints: [kpName] } },
});
expect(paper.status === 201 && paper.json.data.items.length > 0, `按考点组卷 ${paper.json.data.items.length} 题（考试模式）`);

// 清理：删除自适应与组卷练习（无引用可物理删？练习不能删接口——历史保留即可，只清理测试用户不可行）
console.log(failed ? '\n存在失败项 ✗' : '\n全部通过 ✓');
process.exit(failed ? 1 : 0);
