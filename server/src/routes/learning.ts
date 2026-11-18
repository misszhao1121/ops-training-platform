/**
 * 学习激励模块：错题本 / 每日打卡 / 排行榜
 */
import { Router } from 'express';
import { z } from 'zod';
import type { SQLInputValue } from 'node:sqlite';
import { AppError } from '../errors.js';
import { all, get, run } from '../db.js';
import { requireAuth } from '../middleware.js';
import { uid, parseJson } from '../util.js';
import { createAttemptRecord } from './practice.js';

export const learningRouter = Router();

interface WrongRow {
  question_id: string;
  wrong_count: number;
  last_wrong_at: string;
  resolved_at: string | null;
  title: string;
  type: string;
  difficulty: string;
  options: string | null;
  answer: string | null;
  explanation: string | null;
  knowledge_point: string | null;
  category_name: string | null;
}

function serializeWrong(row: WrongRow) {
  return {
    question: {
      id: row.question_id,
      title: row.title,
      type: row.type,
      difficulty: row.difficulty,
      options: parseJson<unknown[]>(row.options, []),
      answer: parseJson<unknown>(row.answer, null),
      explanation: row.explanation,
      knowledgePoint: row.knowledge_point,
      categoryName: row.category_name ?? null,
    },
    wrongCount: Number(row.wrong_count),
    lastWrongAt: row.last_wrong_at,
    resolved: Boolean(row.resolved_at),
  };
}

const WRONG_SELECT = `
  SELECT w.question_id, w.wrong_count, w.last_wrong_at, w.resolved_at,
         q.title, q.type, q.difficulty, q.options, q.answer, q.explanation, q.knowledge_point,
         c.name AS category_name
  FROM wrong_book w
  JOIN questions q ON q.id = w.question_id
  LEFT JOIN categories c ON c.id = q.category_id
`;

// 未掌握错题数（侧边栏角标用）
learningRouter.get('/wrong-book/count', requireAuth, (req, res) => {
  const row = get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM wrong_book WHERE user_id = ? AND resolved_at IS NULL',
    req.user!.sub,
  );
  res.json({ data: { pending: Number(row?.n ?? 0) } });
});

// 错题列表（默认未掌握，resolved=true 查已掌握）
learningRouter.get('/wrong-book', requireAuth, (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20));
  const showResolved = req.query.resolved === 'true';

  const where = showResolved
    ? 'w.user_id = ? AND w.resolved_at IS NOT NULL'
    : 'w.user_id = ? AND w.resolved_at IS NULL';
  const countRow = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM wrong_book w WHERE ${where}`,
    req.user!.sub,
  );
  const total = Number(countRow?.n ?? 0);

  const rows = all<WrongRow>(
    `${WRONG_SELECT} WHERE ${where} ORDER BY w.last_wrong_at DESC LIMIT ? OFFSET ?`,
    req.user!.sub,
    pageSize,
    (page - 1) * pageSize,
  );

  res.json({
    data: rows.map(serializeWrong),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
});

// 移出错题本
learningRouter.delete('/wrong-book/:questionId', requireAuth, (req, res) => {
  run('DELETE FROM wrong_book WHERE user_id = ? AND question_id = ?', req.user!.sub, req.params.questionId);
  res.json({ success: true });
});

// 错题重练：从未掌握错题中随机抽题生成一次练习
const repSchema = z.object({
  count: z.number().int().min(1).max(100).optional(),
  mode: z.enum(['practice', 'exam']).optional(),
});

learningRouter.post('/wrong-book/repractice', requireAuth, (req, res) => {
  const body = repSchema.parse(req.body);
  const count = body.count ?? 10;
  const rows = all<{ question_id: string }>(
    `SELECT question_id FROM wrong_book WHERE user_id = ? AND resolved_at IS NULL ORDER BY RANDOM() LIMIT ?`,
    req.user!.sub,
    count,
  );
  if (!rows.length) {
    throw new AppError(400, '错题本里没有待重练的题目', 'NO_WRONG_QUESTIONS');
  }
  const actualCount = rows.length; // 错题不足时按实际数量抽取
  const attemptId = createAttemptRecord(
    req.user!.sub,
    body.mode ?? 'practice',
    '错题重练',
    rows.map((r) => r.question_id),
  );
  res.status(201).json({ data: { id: attemptId, total: actualCount } });
});

// ===== 每日打卡 =====

const SHANGHAI = 'Asia/Shanghai';
function shanghaiDate(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: SHANGHAI }); // YYYY-MM-DD
}

learningRouter.get('/checkin', requireAuth, (req, res) => {
  const userId = req.user!.sub;

  // 所有打卡日（有创建过练习即算打卡，按东八区自然日归一化）
  const dayRows = all<{ d: string; n: number }>(
    `SELECT DATE(started_at, '+8 hours') AS d, COUNT(*) AS n
     FROM attempts WHERE user_id = ? GROUP BY d ORDER BY d DESC`,
    userId,
  );
  const dayMap = new Map(dayRows.map((r) => [r.d, Number(r.n)]));
  const totalDays = dayMap.size;

  const today = shanghaiDate(new Date());
  const todayDone = dayMap.has(today);

  // 连续天数：从今天开始；今天未打卡则从昨天起算
  let streakDays = 0;
  const cursor = new Date();
  if (!todayDone) cursor.setDate(cursor.getDate() - 1);
  while (dayMap.has(shanghaiDate(cursor))) {
    streakDays += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  // 近 35 天逐日练习次数（前端日历渲染）
  const monthRows = all<{ d: string; n: number }>(
    `SELECT DATE(started_at, '+8 hours') AS d, COUNT(*) AS n
     FROM attempts
     WHERE user_id = ? AND started_at >= datetime('now', '-35 days')
     GROUP BY d`,
    userId,
  );

  res.json({
    data: {
      streakDays,
      totalDays,
      todayDone,
      today,
      recent: monthRows.map((r) => ({ date: r.d, count: Number(r.n) })),
    },
  });
});

// ===== 排行榜 =====

learningRouter.get('/leaderboard', requireAuth, (req, res) => {
  const range = req.query.range === 'week' || req.query.range === 'month' ? req.query.range : 'all';
  const timeFilter =
    range === 'week'
      ? "AND a.started_at >= datetime('now', '-7 days')"
      : range === 'month'
        ? "AND a.started_at >= datetime('now', '-30 days')"
        : '';

  // 聚合 + 全量排名（用户量小，直接返回完整榜单，前端定位自己）
  const rows = all<{
    user_id: string;
    username: string;
    completed: number;
    answered: number;
    correct: number;
    rank: number;
  }>(
    `WITH agg AS (
       SELECT u.id AS user_id, u.username,
              COUNT(DISTINCT a.id) AS completed,
              COUNT(ai.id) AS answered,
              COALESCE(SUM(CASE WHEN ai.is_correct = 1 THEN 1 ELSE 0 END), 0) AS correct
       FROM attempts a
       JOIN users u ON u.id = a.user_id
       LEFT JOIN attempt_items ai ON ai.attempt_id = a.id
       WHERE a.status = 'completed' ${timeFilter}
       GROUP BY u.id
     )
     SELECT user_id, username, completed, answered, correct,
            ROW_NUMBER() OVER (ORDER BY correct DESC, completed DESC, username ASC) AS rank
     FROM agg
     ORDER BY rank
     LIMIT 100`,
  );

  const entries = rows.map((r) => ({
    rank: Number(r.rank),
    userId: r.user_id,
    username: r.username,
    completed: Number(r.completed),
    answered: Number(r.answered),
    correct: Number(r.correct),
    accuracy: Number(r.answered) > 0 ? Math.round((Number(r.correct) / Number(r.answered)) * 100) : null,
  }));

  const me = entries.find((e) => e.userId === req.user!.sub) ?? null;

  res.json({ data: { range, entries, me } });
});
