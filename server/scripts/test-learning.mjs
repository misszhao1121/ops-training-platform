/**
 * 第一档功能端到端测试：错题本 / 打卡 / 排行榜 / 收藏
 * 运行：node scripts/test-learning.mjs
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

// 登录 demo（普通用户，避免污染管理员数据视角）
const login = await apiCall('/auth/login', { method: 'POST', body: { account: 'demo', password: 'demo123' } });
expect(login.status === 200, 'demo 登录');
const T = login.json.token;

// ===== 错题本 =====
// 创建一次练习（1 题全库）
const attemptsBefore = await apiCall('/practice/attempts?page=1&pageSize=1', { token: T });
const created = await apiCall('/practice/attempts', {
  method: 'POST',
  token: T,
  body: { mode: 'practice', count: 1 },
});
expect(created.status === 201, '创建练习');
const attempt = created.json.data;
const q = attempt.items[0].question;
// 详情拿标准答案（练习未交卷不暴露答案——用题库详情接口）
const qDetail = await apiCall(`/questions/${q.id}`, { token: T });
const stdAnswer = qDetail.json.data.answer;

// 先答错（随便一个错误答案）
function wrongAnswerOf(question) {
  if (question.type === 'single_choice' || question.type === 'multiple_choice') {
    const keys = (question.options ?? []).map((o) => o.key);
    if (question.type === 'single_choice') {
      return keys.find((k) => k !== stdAnswer) ?? keys[0];
    }
    return keys.filter((k) => !stdAnswer.includes(k)).slice(0, 1); // 少选必错
  }
  if (question.type === 'true_false') return !(stdAnswer === true || stdAnswer === 'true');
  if (question.type === 'fill_blank') return '绝对不对的答案xyz';
  return '绝对不对的答案xyz';
}
const wrong = wrongAnswerOf(q);
const ans1 = await apiCall(`/practice/attempts/${attempt.id}/answer`, {
  method: 'POST',
  token: T,
  body: { questionId: q.id, answer: wrong },
});
expect(ans1.json.data.isCorrect === false, `答错标记成功（答案 ${JSON.stringify(wrong)}）`);

const wbAfterWrong = await apiCall('/learning/wrong-book', { token: T });
expect(
  wbAfterWrong.json.data.some((x) => x.question.id === q.id),
  '答错后错题本出现该题',
);
expect(
  wbAfterWrong.json.data.find((x) => x.question.id === q.id)?.wrongCount >= 1,
  '错次计数',
);

// 错题重练
const rep = await apiCall('/learning/wrong-book/repractice', { method: 'POST', token: T, body: { count: 10 } });
expect(rep.status === 201, `错题重练创建（实际 ${rep.status}）`);
expect(rep.json.data.total >= 1, `重练包含错题（${rep.json.data.total} 题）`);

// 重练中答对 → 已掌握
const repDetail = await apiCall(`/practice/attempts/${rep.json.data.id}`, { token: T });
const repQ = repDetail.json.data.items[0].question;
const repAns = await apiCall(`/practice/attempts/${rep.json.data.id}/answer`, {
  method: 'POST',
  token: T,
  body: { questionId: repQ.id, answer: qDetail.json.data.answer },
});
expect(repAns.json.data.isCorrect === true, '重练答对');

const wbAfterRight = await apiCall('/learning/wrong-book', { token: T });
expect(
  !wbAfterRight.json.data.some((x) => x.question.id === repQ.id),
  '答对后移出未掌握列表',
);
const resolvedList = await apiCall('/learning/wrong-book?resolved=true', { token: T });
expect(resolvedList.json.data.some((x) => x.question.id === repQ.id), '出现在已掌握列表');

// ===== 打卡 =====
const checkin = await apiCall('/learning/checkin', { token: T });
expect(checkin.json.data.todayDone === true, '今日已打卡（今天创建过练习）');
expect(checkin.json.data.streakDays >= 1, `连续打卡 ${checkin.json.data.streakDays} 天`);
expect(Array.isArray(checkin.json.data.recent), '近 35 天日历数据');

// ===== 排行榜 =====
const lb = await apiCall('/learning/leaderboard?range=all', { token: T });
expect(lb.json.data.entries.length >= 1, `排行榜有 ${lb.json.data.entries.length} 人`);
expect(lb.json.data.me !== null, '包含我的排名');
const meEntry = lb.json.data.entries.find((e) => e.userId === login.json.user.id);
expect(meEntry?.answered >= 1, `我的答题数 ${meEntry?.answered}`);
const lbWeek = await apiCall('/learning/leaderboard?range=week', { token: T });
expect(Array.isArray(lbWeek.json.data.entries), '周榜可用');

// ===== 收藏 =====
const fav1 = await apiCall(`/questions/${q.id}/favorite`, { method: 'POST', token: T });
expect(fav1.json.favorited === true, '收藏成功');
const listWithFav = await apiCall('/questions?q=' + encodeURIComponent(q.title.slice(0, 8)), { token: T });
expect(listWithFav.json.data.find((x) => x.id === q.id)?.favorited === true, '列表 favorited 标记');
const favList = await apiCall('/questions/favorites', { token: T });
expect(favList.json.data.some((x) => x.id === q.id), '收藏列表包含该题');
const detailFav = await apiCall(`/questions/${q.id}`, { token: T });
expect(detailFav.json.data.favorited === true, '详情 favorited 标记');
const fav2 = await apiCall(`/questions/${q.id}/favorite`, { method: 'POST', token: T });
expect(fav2.json.favorited === false, '取消收藏');

// ===== 清理测试数据 =====
await apiCall(`/practice/attempts/${attempt.id}`, { method: 'DELETE' }).catch(() => {});
const delOk = await apiCall(`/questions/${q.id}`, { method: 'DELETE', token: T });
if (delOk.status !== 200) {
  // 有练习引用会归档，正常
}
// 错题本/打卡数据属于用户学习记录，保留不影响

console.log(failed ? '\n存在失败项 ✗' : '\n全部通过 ✓');
process.exit(failed ? 1 : 0);
