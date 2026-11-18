import { Router } from 'express';
import { z } from 'zod';
import type { SQLInputValue } from 'node:sqlite';
import { AppError } from '../errors.js';
import { all, get, run } from '../db.js';
import { requireAuth } from '../middleware.js';
import { uid, now, parseJson, toJson } from '../util.js';
import { gradeQuestion, isObjective } from '../grading.js';

export const practiceRouter = Router();

interface ItemRow {
  id: string;
  attempt_id: string;
  question_id: string;
  position: number;
  user_answer: string | null;
  is_correct: number | null;
  answered_at: string | null;
  title: string;
  type: string;
  difficulty: string;
  options: string | null;
  answer: string | null;
  explanation: string | null;
  knowledge_point: string | null;
}

const ITEM_SELECT = `
  SELECT ai.*, q.title, q.type, q.difficulty, q.options, q.answer, q.explanation, q.knowledge_point
  FROM attempt_items ai
  JOIN questions q ON q.id = ai.question_id
`;

function ownAttempt(attemptId: string, userId: string) {
  const a = get('SELECT * FROM attempts WHERE id = ?', attemptId);
  if (!a) throw new AppError(404, '练习不存在', 'NOT_FOUND');
  if (a.user_id !== userId) throw new AppError(403, '无权访问该练习', 'FORBIDDEN');
  return a;
}

function serializeItem(row: ItemRow, revealAnswer: boolean) {
  const question: Record<string, unknown> = {
    id: row.question_id,
    title: row.title,
    type: row.type,
    difficulty: row.difficulty,
    options: parseJson(row.options, []),
    knowledgePoint: row.knowledge_point,
  };
  if (revealAnswer) {
    question.answer = parseJson(row.answer, null);
    question.explanation = row.explanation;
  }
  const isCorrect = row.is_correct === null || row.is_correct === undefined ? null : Boolean(row.is_correct);
  return {
    id: row.id,
    position: row.position,
    question,
    userAnswer: parseJson(row.user_answer, null),
    isCorrect,
    answeredAt: row.answered_at,
  };
}

function serializeAttempt(a: Record<string, unknown>, items: ItemRow[], revealAnswer: boolean) {
  return {
    id: a.id,
    mode: a.mode,
    title: a.title,
    status: a.status,
    total: Number(a.total ?? 0),
    correct: a.correct == null ? null : Number(a.correct),
    score: a.score == null ? null : Number(a.score),
    startedAt: a.started_at,
    endedAt: a.ended_at,
    items: items.map((i) => serializeItem(i, revealAnswer)),
  };
}

/** 创建一次练习记录（练习创建与错题重练共用） */
export function createAttemptRecord(
  userId: string,
  mode: 'practice' | 'exam' | 'adaptive',
  title: string,
  questionIds: string[],
): string {
  const id = uid();
  run(
    'INSERT INTO attempts (id, user_id, mode, title, status, total) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    userId,
    mode,
    title,
    'in_progress',
    questionIds.length,
  );
  questionIds.forEach((qid, i) => {
    run(
      'INSERT INTO attempt_items (id, attempt_id, question_id, position) VALUES (?, ?, ?, ?)',
      uid(),
      id,
      qid,
      i + 1,
    );
  });
  return id;
}

// 创建一次练习 / 考试
const createSchema = z.object({
  mode: z.enum(['practice', 'exam', 'adaptive']),
  title: z.string().max(100).optional(),
  count: z.number().int().min(1).max(100).optional(),
  filters: z
    .object({
      categoryId: z.string().optional(),
      difficulty: z.string().optional(),
      type: z.string().optional(),
      tag: z.string().optional(),
      knowledgePoints: z.array(z.string()).max(5).optional(),
    })
    .optional(),
  questionIds: z.array(z.string()).optional(),
});

// 抽题筛选条件（创建练习与可用数查询共用）
function buildQuestionConditions(filters: {
  categoryId?: string;
  difficulty?: string;
  type?: string;
  tag?: string;
  knowledgePoints?: string[];
}): { conditions: string[]; params: SQLInputValue[] } {
  const conditions: string[] = ['is_public = 1', 'archived_at IS NULL'];
  const params: SQLInputValue[] = [];
  if (filters.categoryId) {
    conditions.push(
      `category_id IN (
        WITH RECURSIVE cat_tree(id) AS (
          SELECT id FROM categories WHERE id = ?
          UNION ALL
          SELECT c.id FROM categories c JOIN cat_tree ct ON c.parent_id = ct.id
        ) SELECT id FROM cat_tree
      )`,
    );
    params.push(filters.categoryId);
  }
  if (filters.difficulty) { conditions.push('difficulty = ?'); params.push(filters.difficulty); }
  if (filters.type) { conditions.push('type = ?'); params.push(filters.type); }
  if (filters.tag) {
    conditions.push('id IN (SELECT question_id FROM question_tags qt JOIN tags t ON t.id = qt.tag_id WHERE t.name = ?)');
    params.push(filters.tag);
  }
  if (filters.knowledgePoints?.length) {
    conditions.push(`(${filters.knowledgePoints.map(() => 'knowledge_point LIKE ?').join(' OR ')})`);
    for (const kp of filters.knowledgePoints) params.push(`%${kp.trim()}%`);
  }
  return { conditions, params };
}

// 当前筛选条件下可抽取的题目数（前端实时提示用）
practiceRouter.get('/available', requireAuth, (req, res) => {
  const { conditions, params } = buildQuestionConditions({
    categoryId: req.query.categoryId ? String(req.query.categoryId) : undefined,
    difficulty: req.query.difficulty ? String(req.query.difficulty) : undefined,
    type: req.query.type ? String(req.query.type) : undefined,
    tag: req.query.tag ? String(req.query.tag) : undefined,
    knowledgePoints: req.query.knowledgePoints ? String(req.query.knowledgePoints).split(',') : undefined,
  });
  const row = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM questions WHERE ${conditions.join(' AND ')}`,
    ...params,
  );
  res.json({ data: { available: Number(row?.n ?? 0) } });
});

practiceRouter.post('/attempts', requireAuth, (req, res) => {
  const body = createSchema.parse(req.body);
  const count = body.count ?? 10;

  // 自适应练习：不预抽题，逐题动态追加（范围持久化到 attempts.filters）
  if (body.mode === 'adaptive') {
    const f = body.filters ?? {};
    const { conditions, params } = buildQuestionConditions(f);
    const countRow = get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM questions WHERE ${conditions.join(' AND ')}`,
      ...params,
    );
    if (Number(countRow?.n ?? 0) === 0) {
      throw new AppError(400, '没有符合条件的题目，请调整筛选条件', 'NO_QUESTIONS');
    }
    const attemptId = createAttemptRecord(req.user!.sub, 'adaptive', body.title ?? '自适应练习', []);
    run('UPDATE attempts SET filters = ? WHERE id = ?', toJson(f), attemptId);
    const a = get('SELECT * FROM attempts WHERE id = ?', attemptId)!;
    return res.status(201).json({ data: serializeAttempt(a, [], false) });
  }

  let questionIds: string[];
  if (body.questionIds && body.questionIds.length > 0) {
    const placeholders = body.questionIds.map(() => '?').join(',');
    const rows = all<{ id: string }>(
      `SELECT id FROM questions WHERE id IN (${placeholders}) AND is_public = 1 AND archived_at IS NULL`,
      ...body.questionIds,
    );
    const seen = new Set(rows.map((r) => r.id));
    // 保持传入顺序，并过滤掉不存在的
    questionIds = body.questionIds.filter((id) => seen.has(id));
  } else {
    const { conditions, params } = buildQuestionConditions(body.filters ?? {});

    // 题量校验：请求多少道就应有多少道，不足则明确报错（避免静默少抽）
    const countRow = get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM questions WHERE ${conditions.join(' AND ')}`,
      ...params,
    );
    const available = Number(countRow?.n ?? 0);
    if (available < count) {
      throw new AppError(
        400,
        available === 0
          ? '没有符合条件的题目，请调整筛选条件'
          : `该条件下仅有 ${available} 道题目，不足 ${count} 道，请调整筛选条件或减少题量`,
        'NOT_ENOUGH_QUESTIONS',
      );
    }

    const rows = all<{ id: string }>(
      `SELECT id FROM questions WHERE ${conditions.join(' AND ')} ORDER BY RANDOM() LIMIT ?`,
      ...params,
      count,
    );
    questionIds = rows.map((r) => r.id);
  }

  if (questionIds.length === 0) {
    throw new AppError(400, '没有符合条件的题目，请调整筛选条件', 'NO_QUESTIONS');
  }

  const id = uid();
  const attemptId = createAttemptRecord(
    req.user!.sub,
    body.mode,
    body.title ?? (body.mode === 'exam' ? '模拟考试' : '随机练习'),
    questionIds,
  );

  const a = get('SELECT * FROM attempts WHERE id = ?', attemptId)!;
  const items = all<ItemRow>(`${ITEM_SELECT} WHERE ai.attempt_id = ? ORDER BY ai.position`, attemptId);
  res.status(201).json({ data: serializeAttempt(a, items, false) });
});

// ===== 自适应练习：动态追加下一题 =====
const nextSchema = z.object({
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
});

practiceRouter.post('/attempts/:id/next', requireAuth, (req, res) => {
  const a = ownAttempt(req.params.id, req.user!.sub);
  if (a.status === 'completed') throw new AppError(400, '该练习已交卷', 'COMPLETED');
  if (a.mode !== 'adaptive') {
    throw new AppError(400, '仅自适应练习支持动态追加题目', 'NOT_ADAPTIVE');
  }
  const body = nextSchema.parse(req.body);

  const raw = parseJson<Record<string, unknown>>(
    typeof a.filters === 'string' ? a.filters : '{}',
    {},
  );
  const f = {
    categoryId: typeof raw.categoryId === 'string' ? raw.categoryId : undefined,
    difficulty: typeof raw.difficulty === 'string' ? raw.difficulty : undefined,
    type: typeof raw.type === 'string' ? raw.type : undefined,
    tag: typeof raw.tag === 'string' ? raw.tag : undefined,
    knowledgePoints: Array.isArray(raw.knowledgePoints)
      ? raw.knowledgePoints.filter((x): x is string => typeof x === 'string')
      : undefined,
  };
  const { conditions, params } = buildQuestionConditions(f);
  const existing = all<{ question_id: string }>(
    'SELECT question_id FROM attempt_items WHERE attempt_id = ?',
    a.id,
  ).map((r) => r.question_id);
  const exclude = existing.length
    ? `AND id NOT IN (${existing.map(() => '?').join(',')})`
    : '';
  const excludeParams: SQLInputValue[] = existing;

  // 优先指定难度，范围内没有该难度的新题时退回任意难度
  let row: { id: string } | undefined;
  if (body.difficulty) {
    row = get<{ id: string }>(
      `SELECT id FROM questions WHERE ${conditions.join(' AND ')} AND difficulty = ? ${exclude} ORDER BY RANDOM() LIMIT 1`,
      ...params,
      body.difficulty,
      ...excludeParams,
    );
  }
  if (!row) {
    row = get<{ id: string }>(
      `SELECT id FROM questions WHERE ${conditions.join(' AND ')} ${exclude} ORDER BY RANDOM() LIMIT 1`,
      ...params,
      ...excludeParams,
    );
  }
  if (!row) {
    throw new AppError(400, '该范围内没有更多新题了，可以结束练习查看成绩', 'NO_MORE_QUESTIONS');
  }

  const position = existing.length + 1;
  run(
    'INSERT INTO attempt_items (id, attempt_id, question_id, position) VALUES (?, ?, ?, ?)',
    uid(),
    a.id,
    row.id,
    position,
  );
  run('UPDATE attempts SET total = ? WHERE id = ?', position, a.id);

  const item = get<ItemRow>(
    `${ITEM_SELECT} WHERE ai.attempt_id = ? AND ai.question_id = ?`,
    a.id,
    row.id,
  )!;
  res.json({ data: serializeItem(item, false) });
});

// 我的练习历史
practiceRouter.get('/attempts', requireAuth, (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20));
  const total = Number(
    get<{ n: number }>('SELECT COUNT(*) AS n FROM attempts WHERE user_id = ?', req.user!.sub)?.n ?? 0,
  );
  const rows = all(
    `SELECT id, mode, title, status, total, correct, score, started_at, ended_at
     FROM attempts WHERE user_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?`,
    req.user!.sub,
    pageSize,
    (page - 1) * pageSize,
  );
  res.json({
    data: rows.map((r) => ({
      id: r.id,
      mode: r.mode,
      title: r.title,
      status: r.status,
      total: Number(r.total),
      correct: r.correct == null ? null : Number(r.correct),
      score: r.score == null ? null : Number(r.score),
      startedAt: r.started_at,
      endedAt: r.ended_at,
    })),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
});

// 练习详情（进行中不暴露答案，完成后暴露）
practiceRouter.get('/attempts/:id', requireAuth, (req, res) => {
  const a = ownAttempt(req.params.id, req.user!.sub);
  const items = all<ItemRow>(`${ITEM_SELECT} WHERE ai.attempt_id = ? ORDER BY ai.position`, a.id);
  const reveal = a.status === 'completed';
  res.json({ data: serializeAttempt(a, items, reveal) });
});

// 提交单题答案
const answerSchema = z.object({
  questionId: z.string(),
  answer: z.unknown(),
});

practiceRouter.post('/attempts/:id/answer', requireAuth, (req, res) => {
  const a = ownAttempt(req.params.id, req.user!.sub);
  if (a.status === 'completed') throw new AppError(400, '该练习已交卷，无法继续作答', 'COMPLETED');

  const body = answerSchema.parse(req.body);
  const item = get<ItemRow>(
    `${ITEM_SELECT} WHERE ai.attempt_id = ? AND ai.question_id = ?`,
    a.id,
    body.questionId,
  );
  if (!item) throw new AppError(404, '该题目不在本次练习中', 'NOT_FOUND');

  const stdAnswer = parseJson(item.answer, null);
  const isCorrect = gradeQuestion(item.type, stdAnswer, body.answer);
  run(
    `UPDATE attempt_items SET user_answer = ?, is_correct = ?, answered_at = ? WHERE id = ?`,
    toJson(body.answer),
    isCorrect === null ? null : isCorrect ? 1 : 0,
    now(),
    item.id,
  );

  // 错题本维护：答错收题（累计次数），答对标记已掌握
  if (isCorrect === false) {
    run(
      `INSERT INTO wrong_book (user_id, question_id, wrong_count, last_wrong_at, resolved_at)
       VALUES (?, ?, 1, datetime('now'), NULL)
       ON CONFLICT(user_id, question_id) DO UPDATE SET
         wrong_count = wrong_count + 1,
         last_wrong_at = datetime('now'),
         resolved_at = NULL`,
      req.user!.sub,
      item.question_id,
    );
  } else if (isCorrect === true) {
    run(
      `UPDATE wrong_book SET resolved_at = datetime('now')
       WHERE user_id = ? AND question_id = ? AND resolved_at IS NULL`,
      req.user!.sub,
      item.question_id,
    );
  }

  // 练习/自适应模式立即反馈；考试模式交卷前不反馈
  const result: Record<string, unknown> = { recorded: true };
  if (a.mode === 'practice' || a.mode === 'adaptive') {
    result.isCorrect = isCorrect;
    result.explanation = item.explanation;
  }
  res.json({ data: result });
});

// 交卷
practiceRouter.post('/attempts/:id/submit', requireAuth, (req, res) => {
  const a = ownAttempt(req.params.id, req.user!.sub);
  if (a.status === 'completed') throw new AppError(400, '该练习已交卷', 'COMPLETED');

  const items = all<ItemRow>(`${ITEM_SELECT} WHERE ai.attempt_id = ? ORDER BY ai.position`, a.id);
  // 未作答的客观题记为错误
  for (const item of items) {
    if (item.is_correct === null || item.is_correct === undefined) {
      if (item.user_answer == null && isObjective(item.type)) {
        run('UPDATE attempt_items SET is_correct = 0 WHERE id = ?', item.id);
      }
    }
  }
  const graded = all<{ type: string; is_correct: number | null }>(
    `SELECT q.type, ai.is_correct FROM attempt_items ai JOIN questions q ON q.id = ai.question_id WHERE ai.attempt_id = ?`,
    a.id,
  );
  const objective = graded.filter((g) => isObjective(g.type));
  const correct = objective.filter((g) => g.is_correct === 1).length;
  const score = objective.length ? Math.round((correct / objective.length) * 100) : 0;

  run(
    `UPDATE attempts SET status = 'completed', correct = ?, score = ?, ended_at = ? WHERE id = ?`,
    correct,
    score,
    now(),
    a.id,
  );

  const updated = get('SELECT * FROM attempts WHERE id = ?', a.id)!;
  const refreshed = all<ItemRow>(`${ITEM_SELECT} WHERE ai.attempt_id = ? ORDER BY ai.position`, a.id);
  res.json({
    data: {
      ...serializeAttempt(updated, refreshed, true),
      objectiveCount: objective.length,
    },
  });
});
