import { Router } from 'express';
import { z } from 'zod';
import type { SQLInputValue } from 'node:sqlite';
import { AppError } from '../errors.js';
import { all, get, run } from '../db.js';
import { requireAuth } from '../middleware.js';
import { uid, now, parseJson, toJson } from '../util.js';
import { gradeInterviewAnswer, summarizeInterview } from '../interview-scoring.js';

export const interviewRouter = Router();

interface SessionRow {
  id: string;
  user_id: string;
  topic: string | null;
  status: string;
  messages: string | null;
  question_ids: string | null;
  answers: string | null;
  score: number | null;
  feedback: string | null;
  created_at: string;
  ended_at: string | null;
}

interface QuestionRow {
  id: string;
  title: string;
  type: string;
  difficulty: string;
  category_id: string | null;
  category_name: string | null;
  answer: string | null;
  explanation: string | null;
  knowledge_point: string | null;
}

interface AnswerRecord {
  questionId: string;
  answer: string;
  score: number;
  hits: string[];
  missed: string[];
  comment: string;
  answeredAt: string;
}

function ownSession(id: string, userId: string): SessionRow {
  const s = get<SessionRow>('SELECT * FROM interview_sessions WHERE id = ?', id);
  if (!s) throw new AppError(404, '面试会话不存在', 'NOT_FOUND');
  if (s.user_id !== userId) throw new AppError(403, '无权访问该面试会话', 'FORBIDDEN');
  return s;
}

/** 面试题：取问答题/简答题，优先取有参考答案的题目 */
const INTERVIEW_SELECT = `
  SELECT q.id, q.title, q.type, q.difficulty, q.category_id, c.name AS category_name,
         q.answer, q.explanation, q.knowledge_point
  FROM questions q
  LEFT JOIN categories c ON c.id = q.category_id
`;

function loadQuestions(ids: string[]): QuestionRow[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = all<QuestionRow>(`${INTERVIEW_SELECT} WHERE q.id IN (${placeholders})`, ...ids);
  const map = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => map.get(id)).filter(Boolean) as QuestionRow[];
}

/** 对外输出题目（面试进行中不暴露参考答案） */
function serializeQuestion(q: QuestionRow, reveal: boolean) {
  const base: Record<string, unknown> = {
    id: q.id,
    title: q.title,
    type: q.type,
    difficulty: q.difficulty,
    categoryId: q.category_id,
    categoryName: q.category_name,
    knowledgePoint: q.knowledge_point,
  };
  if (reveal) {
    base.referenceAnswer = parseJson<string>(q.answer, '');
    base.explanation = q.explanation;
  }
  return base;
}

function serializeSession(s: SessionRow, reveal = false) {
  const ids = parseJson<string[]>(s.question_ids, []);
  const answers = parseJson<AnswerRecord[]>(s.answers, []);
  const questions = loadQuestions(ids);
  const answerMap = new Map(answers.map((a) => [a.questionId, a]));

  return {
    id: s.id,
    topic: s.topic,
    status: s.status,
    score: s.score == null ? null : Number(s.score),
    feedback: parseJson<Record<string, unknown> | null>(s.feedback, null),
    createdAt: s.created_at,
    endedAt: s.ended_at,
    total: ids.length,
    answeredCount: answers.length,
    questions: questions.map((q) => {
      const rec = answerMap.get(q.id);
      return {
        ...serializeQuestion(q, reveal),
        answer: rec
          ? {
              content: rec.answer,
              score: rec.score,
              hits: rec.hits,
              missed: rec.missed,
              comment: rec.comment,
              answeredAt: rec.answeredAt,
            }
          : null,
      };
    }),
  };
}

// ===== 可选面试主题（前端用来给用户挑方向）=====
interviewRouter.get('/topics', (_req, res) => {
  const rows = all<{ id: string; name: string; n: number }>(
    `SELECT c.id, c.name, COUNT(q.id) AS n
     FROM categories c
     JOIN questions q ON q.category_id = c.id AND q.is_public = 1 AND q.archived_at IS NULL
     GROUP BY c.id HAVING n > 0 ORDER BY c.sort_order, c.name`,
  );
  res.json({ data: rows.map((r) => ({ id: r.id, name: r.name, questionCount: Number(r.n) })) });
});

// ===== 创建一场面试 =====
const createSchema = z.object({
  categoryId: z.string().optional(),
  difficulty: z.string().optional(),
  count: z.number().int().min(1).max(20).optional(),
  topic: z.string().max(60).optional(),
});

interviewRouter.post('/sessions', requireAuth, (req, res) => {
  const body = createSchema.parse(req.body);
  const count = body.count ?? 5;

  const conditions: string[] = ['q.is_public = 1', 'q.archived_at IS NULL'];
  const params: SQLInputValue[] = [];
  if (body.categoryId) {
    conditions.push(
      `q.category_id IN (
        WITH RECURSIVE cat_tree(id) AS (
          SELECT id FROM categories WHERE id = ?
          UNION ALL
          SELECT c.id FROM categories c JOIN cat_tree ct ON c.parent_id = ct.id
        ) SELECT id FROM cat_tree
      )`,
    );
    params.push(body.categoryId);
  }
  if (body.difficulty) {
    conditions.push('q.difficulty = ?');
    params.push(body.difficulty);
  }

  // 优先抽「简答/问答类」题目（面试更贴近），不足时再补其它题型
  const where = `WHERE ${conditions.join(' AND ')}`;
  let rows = all<{ id: string }>(
    `SELECT q.id FROM questions q ${where} AND q.type = 'short_answer' ORDER BY RANDOM() LIMIT ?`,
    ...params,
    count,
  );
  if (rows.length < count) {
    const exclude = rows.map((r) => r.id);
    const placeholders = exclude.map(() => '?').join(',');
    const extra = all<{ id: string }>(
      `SELECT q.id FROM questions q ${where} ${exclude.length ? `AND q.id NOT IN (${placeholders})` : ''} ORDER BY RANDOM() LIMIT ?`,
      ...params,
      ...exclude,
      count - rows.length,
    );
    rows = [...rows, ...extra];
  }

  if (rows.length === 0) {
    throw new AppError(400, '没有符合条件的面试题，请调整主题或难度', 'NO_QUESTIONS');
  }

  const id = uid();
  const questionIds = rows.map((r) => r.id);
  run(
    'INSERT INTO interview_sessions (id, user_id, topic, status, question_ids, answers) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    req.user!.sub,
    body.topic ?? '综合面试',
    'in_progress',
    toJson(questionIds),
    toJson([]),
  );

  const s = get<SessionRow>('SELECT * FROM interview_sessions WHERE id = ?', id)!;
  res.status(201).json({ data: serializeSession(s, false) });
});

// ===== 我的面试历史 =====
interviewRouter.get('/sessions', requireAuth, (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20));
  const total = Number(
    get<{ n: number }>('SELECT COUNT(*) AS n FROM interview_sessions WHERE user_id = ?', req.user!.sub)?.n ?? 0,
  );
  const rows = all<SessionRow>(
    `SELECT * FROM interview_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    req.user!.sub,
    pageSize,
    (page - 1) * pageSize,
  );
  res.json({
    data: rows.map((s) => ({
      id: s.id,
      topic: s.topic,
      status: s.status,
      score: s.score == null ? null : Number(s.score),
      total: parseJson<string[]>(s.question_ids, []).length,
      answeredCount: parseJson<AnswerRecord[]>(s.answers, []).length,
      createdAt: s.created_at,
      endedAt: s.ended_at,
    })),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
});

// ===== 面试详情 =====
interviewRouter.get('/sessions/:id', requireAuth, (req, res) => {
  const s = ownSession(req.params.id, req.user!.sub);
  res.json({ data: serializeSession(s, s.status === 'completed') });
});

// ===== 提交单题作答并即时评分 =====
const answerSchema = z.object({
  questionId: z.string(),
  answer: z.string().max(5000),
});

interviewRouter.post('/sessions/:id/answer', requireAuth, (req, res) => {
  const s = ownSession(req.params.id, req.user!.sub);
  if (s.status === 'completed') {
    throw new AppError(400, '该面试已结束，无法继续作答', 'COMPLETED');
  }

  const body = answerSchema.parse(req.body);
  const ids = parseJson<string[]>(s.question_ids, []);
  if (!ids.includes(body.questionId)) {
    throw new AppError(404, '该题目不在本次面试中', 'NOT_FOUND');
  }

  const q = get<QuestionRow>(`${INTERVIEW_SELECT} WHERE q.id = ?`, body.questionId);
  if (!q) throw new AppError(404, '题目不存在', 'NOT_FOUND');

  const reference = parseJson<string>(q.answer, '');
  const result = gradeInterviewAnswer(reference, q.explanation, body.answer);

  const answers = parseJson<AnswerRecord[]>(s.answers, []).filter((a) => a.questionId !== body.questionId);
  answers.push({
    questionId: body.questionId,
    answer: body.answer,
    score: result.score,
    hits: result.hits,
    missed: result.missed,
    comment: result.comment,
    answeredAt: now(),
  });

  run('UPDATE interview_sessions SET answers = ? WHERE id = ?', toJson(answers), s.id);

  res.json({
    data: {
      questionId: body.questionId,
      score: result.score,
      hits: result.hits,
      missed: result.missed,
      comment: result.comment,
      referenceAnswer: reference,
      explanation: q.explanation,
    },
  });
});

// ===== 结束面试，生成总评 =====
interviewRouter.post('/sessions/:id/finish', requireAuth, (req, res) => {
  const s = ownSession(req.params.id, req.user!.sub);
  if (s.status === 'completed') {
    res.json({ data: serializeSession(s, true) });
    return;
  }

  const ids = parseJson<string[]>(s.question_ids, []);
  const answers = parseJson<AnswerRecord[]>(s.answers, []);
  if (answers.length === 0) {
    throw new AppError(400, '至少回答一道题后才能结束面试', 'NO_ANSWERS');
  }

  const summary = summarizeInterview(answers.map((a) => ({ score: a.score })));
  const questions = loadQuestions(ids);
  const qMap = new Map(questions.map((q) => [q.id, q]));

  // 按分类统计薄弱点
  const byCategory = new Map<string, { name: string; total: number; sum: number }>();
  for (const a of answers) {
    const q = qMap.get(a.questionId);
    const name = q?.category_name ?? '未分类';
    const cur = byCategory.get(name) ?? { name, total: 0, sum: 0 };
    cur.total += 1;
    cur.sum += a.score;
    byCategory.set(name, cur);
  }
  const categoryScores = [...byCategory.values()]
    .map((c) => ({ name: c.name, count: c.total, avgScore: Math.round(c.sum / c.total) }))
    .sort((a, b) => a.avgScore - b.avgScore);

  const feedback = {
    level: summary.level,
    advice: summary.advice,
    score: summary.score,
    answeredCount: answers.length,
    totalCount: ids.length,
    categoryScores,
    weakest: categoryScores.slice(0, 3),
    details: answers.map((a) => ({
      questionId: a.questionId,
      title: qMap.get(a.questionId)?.title ?? '',
      score: a.score,
      hits: a.hits,
      missed: a.missed,
      comment: a.comment,
    })),
  };

  run(
    `UPDATE interview_sessions SET status = 'completed', score = ?, feedback = ?, ended_at = ? WHERE id = ?`,
    summary.score,
    toJson(feedback),
    now(),
    s.id,
  );

  const updated = get<SessionRow>('SELECT * FROM interview_sessions WHERE id = ?', s.id)!;
  res.json({ data: serializeSession(updated, true) });
});

// ===== 删除面试记录 =====
interviewRouter.delete('/sessions/:id', requireAuth, (req, res) => {
  const s = ownSession(req.params.id, req.user!.sub);
  run('DELETE FROM interview_sessions WHERE id = ?', s.id);
  res.json({ success: true });
});
