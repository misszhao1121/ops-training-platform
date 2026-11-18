import { Router } from 'express';
import { z } from 'zod';
import type { SQLInputValue } from 'node:sqlite';
import { AppError } from '../errors.js';
import { all, get, run } from '../db.js';
import { requireAdmin, requireAuth, optionalAuth } from '../middleware.js';
import { uid, parseJson } from '../util.js';
import { parseImportFile } from '../import-parser.js';

export const QUESTION_TYPES = ['single_choice', 'multiple_choice', 'true_false', 'fill_blank', 'short_answer'] as const;
export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

export const questionsRouter = Router();

// ===== 题库导入（管理员）：先解析预览，再确认写库 =====

const importParseSchema = z.object({
  filename: z.string().min(1),
  contentBase64: z.string().min(1),
});

const importCommitSchema = z.object({
  // 新分类的挂载行业（一级分类 id），可选
  industryId: z.string().nullable().optional(),
  questions: z
    .array(
      z.object({
        title: z.string().min(1, '题干不能为空'),
        type: z.enum(QUESTION_TYPES),
        difficulty: z.enum(DIFFICULTIES),
        options: z.array(z.object({ key: z.string(), text: z.string() })).optional(),
        answer: z.unknown().optional(),
        explanation: z.string().optional(),
        knowledgePoint: z.string().optional(),
        categoryName: z.string().optional(),
        tags: z.array(z.string()).optional(),
        source: z.string().optional(),
      }),
    )
    .min(1, '没有可导入的题目'),
});

/** 按名称查找分类，不存在则创建（可指定归属行业） */
function resolveCategory(name: string, industryId?: string | null): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const existing = get<{ id: string }>('SELECT id FROM categories WHERE name = ?', trimmed);
  if (existing) return existing.id;
  const id = uid();
  // 校验行业必须是有效的一级分类，防止挂到任意节点
  let parentId: string | null = null;
  if (industryId) {
    const ind = get<{ id: string }>(
      'SELECT id FROM categories WHERE id = ? AND parent_id IS NULL',
      industryId,
    );
    parentId = ind?.id ?? null;
  }
  run('INSERT INTO categories (id, name, slug, parent_id) VALUES (?, ?, ?, ?)', id, trimmed, trimmed, parentId);
  return id;
}

// 第一步：上传文件（base64），解析为结构化题目，不写库
questionsRouter.post('/import/parse', requireAuth, requireAdmin, (req, res) => {
  const body = importParseSchema.parse(req.body);
  let buffer: Buffer;
  try {
    buffer = Buffer.from(body.contentBase64, 'base64');
  } catch {
    throw new AppError(400, '文件内容不是有效的 base64', 'BAD_REQUEST');
  }
  if (buffer.length === 0) throw new AppError(400, '文件内容为空', 'BAD_REQUEST');

  const result = parseImportFile(body.filename, buffer);
  res.json({ data: result.questions, errors: result.errors });
});

// 第二步：确认导入（写库）
questionsRouter.post('/import', requireAuth, requireAdmin, (req, res) => {
  const body = importCommitSchema.parse(req.body);

  let imported = 0;
  const skipped: string[] = [];
  for (const q of body.questions) {
    try {
      const id = uid();
      const categoryId = resolveCategory(q.categoryName ?? '', body.industryId);
      run(
        `INSERT INTO questions (id, title, type, difficulty, category_id, options, answer, explanation, knowledge_point, source, is_public, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        q.title,
        q.type,
        q.difficulty,
        categoryId,
        q.options && q.options.length ? JSON.stringify(q.options) : null,
        q.answer !== undefined && q.answer !== null ? JSON.stringify(q.answer) : null,
        q.explanation || null,
        q.knowledgePoint || null,
        q.source || null,
        1,
        req.user!.sub,
      );
      if (q.tags?.length) upsertTags(id, q.tags);
      imported += 1;
    } catch (err) {
      skipped.push(`${q.title.slice(0, 30)}：${err instanceof Error ? err.message : String(err)}`);
    }
  }
  res.json({ success: true, imported, skipped, total: body.questions.length });
});

interface QuestionRow {
  id: string;
  title: string;
  type: string;
  difficulty: string;
  category_id: string | null;
  category_name?: string | null;
  options: string | null;
  answer: string | null;
  explanation: string | null;
  knowledge_point: string | null;
  source: string | null;
  is_public: number;
  archived_at?: string | null;
  created_at: string;
  updated_at: string;
  tag_ids?: string | null;
  tag_names?: string | null;
}

function tagGrouped(row: QuestionRow): { tags: { id: string; name: string }[] } {
  const ids = (row.tag_ids ?? '').split(',').filter(Boolean);
  const names = (row.tag_names ?? '').split(',').filter(Boolean);
  return { tags: ids.map((id, i) => ({ id, name: names[i] ?? '' })) };
}

/** 列表用：不含标准答案 */
function serializeListItem(row: QuestionRow, favorited?: boolean) {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    difficulty: row.difficulty,
    categoryId: row.category_id,
    categoryName: row.category_name ?? null,
    knowledgePoint: row.knowledge_point,
    source: row.source,
    isPublic: Boolean(row.is_public),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    favorited: favorited ?? undefined,
    ...tagGrouped(row),
  };
}

/** 详情用：含选项、标准答案与解析 */
function serializeDetail(row: QuestionRow, favorited?: boolean) {
  return {
    ...serializeListItem(row, favorited),
    options: parseJson<any[]>(row.options, []),
    answer: parseJson<unknown>(row.answer, null),
    explanation: row.explanation,
  };
}

const BASE_SELECT = `
  SELECT q.*, c.name AS category_name,
    (SELECT GROUP_CONCAT(t.id, ',') FROM tags t
       JOIN question_tags qt ON qt.tag_id = t.id WHERE qt.question_id = q.id) AS tag_ids,
    (SELECT GROUP_CONCAT(t.name, ',') FROM tags t
       JOIN question_tags qt ON qt.tag_id = t.id WHERE qt.question_id = q.id) AS tag_names
  FROM questions q
  LEFT JOIN categories c ON c.id = q.category_id
`;

// 分类树递归：包含所有后代分类
const DESC_CTE = `
  WITH RECURSIVE cat_tree(id) AS (
    SELECT id FROM categories WHERE id = ?
    UNION ALL
    SELECT c.id FROM categories c JOIN cat_tree ct ON c.parent_id = ct.id
  )
`;

questionsRouter.get('/', optionalAuth, (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const conditions: string[] = [];
  const params: SQLInputValue[] = [];

  // 普通用户默认只看公开题；管理员可看全部（用 includeAll 控制）
  const includeAll = req.query.includeAll === 'true' && req.user?.role === 'ADMIN';
  // 管理员查看归档题时，不应按 is_public 过滤（归档题已置 is_public=0）
  if (!includeAll && !(req.query.includeArchived === 'true' && req.user?.role === 'ADMIN')) {
    conditions.push('q.is_public = 1');
  }
  // 已归档（软删除）的题目默认不出现在题库列表中
  if (req.query.includeArchived !== 'true' || req.user?.role !== 'ADMIN') {
    conditions.push('q.archived_at IS NULL');
  }

  if (req.query.categoryId) {
    const cid = String(req.query.categoryId);
    conditions.push(`q.category_id IN (${DESC_CTE} SELECT id FROM cat_tree)`);
    params.push(cid);
  }
  if (req.query.difficulty) { conditions.push('q.difficulty = ?'); params.push(String(req.query.difficulty)); }
  if (req.query.type) { conditions.push('q.type = ?'); params.push(String(req.query.type)); }
  if (req.query.tag) {
    conditions.push('q.id IN (SELECT question_id FROM question_tags qt JOIN tags t ON t.id = qt.tag_id WHERE t.name = ?)');
    params.push(String(req.query.tag));
  }
  if (req.query.q) {
    conditions.push('(q.title LIKE ? OR q.knowledge_point LIKE ? OR q.source LIKE ?)');
    const kw = `%${String(req.query.q)}%`;
    params.push(kw, kw, kw);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const countRow = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM questions q LEFT JOIN categories c ON c.id = q.category_id ${where}`,
    ...params,
  );
  const total = Number(countRow?.n ?? 0);

  const orderBy =
    req.query.sort === 'difficulty' ? 'q.difficulty ASC, q.created_at DESC'
      : req.query.sort === 'oldest' ? 'q.created_at ASC'
      : 'q.created_at DESC';

  const rows = all<QuestionRow>(
    `${BASE_SELECT} ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    ...params,
    pageSize,
    (page - 1) * pageSize,
  );

  // 当前用户收藏集合（批量标记 favorited）
  let favSet = new Set<string>();
  if (req.user && rows.length) {
    const ph = rows.map(() => '?').join(',');
    const favRows = all<{ question_id: string }>(
      `SELECT question_id FROM favorites WHERE user_id = ? AND question_id IN (${ph})`,
      req.user.sub,
      ...rows.map((r) => r.id),
    );
    favSet = new Set(favRows.map((r) => r.question_id));
  }

  res.json({
    data: rows.map((r) => serializeListItem(r, favSet.has(r.id))),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
});

// 全部考点（去重，供组卷/筛选下拉）
questionsRouter.get('/knowledge-points', requireAuth, (req, res) => {
  const rows = all<{ knowledge_point: string; n: number }>(
    `SELECT knowledge_point, COUNT(*) AS n
     FROM questions
     WHERE is_public = 1 AND archived_at IS NULL AND knowledge_point IS NOT NULL AND knowledge_point != ''
     GROUP BY knowledge_point ORDER BY n DESC`,
  );
  res.json({ data: rows.map((r) => ({ name: r.knowledge_point, count: Number(r.n) })) });
});

// 我的收藏列表
questionsRouter.get('/favorites', requireAuth, (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20));
  const total = Number(
    get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM favorites WHERE user_id = ?',
      req.user!.sub,
    )?.n ?? 0,
  );
  const rows = all<QuestionRow>(
    `${BASE_SELECT} JOIN favorites f ON f.question_id = q.id AND f.user_id = ?
     ORDER BY f.created_at DESC LIMIT ? OFFSET ?`,
    req.user!.sub,
    pageSize,
    (page - 1) * pageSize,
  );
  res.json({
    data: rows.map((r) => serializeDetail(r, true)),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
});

// 切换收藏（已收藏则取消）
questionsRouter.post('/:id/favorite', requireAuth, (req, res) => {
  const id = req.params.id;
  if (!get('SELECT id FROM questions WHERE id = ?', id)) {
    throw new AppError(404, '题目不存在', 'NOT_FOUND');
  }
  const existing = get<{ question_id: string }>(
    'SELECT question_id FROM favorites WHERE user_id = ? AND question_id = ?',
    req.user!.sub,
    id,
  );
  if (existing) {
    run('DELETE FROM favorites WHERE user_id = ? AND question_id = ?', req.user!.sub, id);
    res.json({ success: true, favorited: false });
  } else {
    run('INSERT INTO favorites (user_id, question_id) VALUES (?, ?)', req.user!.sub, id);
    res.json({ success: true, favorited: true });
  }
});

questionsRouter.get('/:id', optionalAuth, (req, res) => {
  const row = get<QuestionRow>(`${BASE_SELECT} WHERE q.id = ?`, req.params.id);
  if (!row) throw new AppError(404, '题目不存在', 'NOT_FOUND');
  if (!row.is_public && req.user?.role !== 'ADMIN') {
    throw new AppError(404, '题目不存在', 'NOT_FOUND');
  }
  if (row.archived_at && req.user?.role !== 'ADMIN') {
    throw new AppError(404, '题目不存在', 'NOT_FOUND');
  }
  const fav = req.user
    ? Boolean(
        get('SELECT question_id FROM favorites WHERE user_id = ? AND question_id = ?', req.user.sub, row.id),
      )
    : false;
  res.json({ data: serializeDetail(row, fav) });
});

const questionSchema = z.object({
  title: z.string().min(1, '题干不能为空'),
  type: z.enum(QUESTION_TYPES),
  difficulty: z.enum(DIFFICULTIES),
  categoryId: z.string().nullable().optional(),
  tags: z.array(z.string()).max(10).optional(),
  options: z
    .array(z.object({ key: z.string(), text: z.string() }))
    .optional(),
  answer: z.unknown().optional(),
  explanation: z.string().optional(),
  knowledgePoint: z.string().optional(),
  source: z.string().optional(),
  isPublic: z.boolean().optional(),
});

function upsertTags(questionId: string, tags: string[]) {
  run('DELETE FROM question_tags WHERE question_id = ?', questionId);
  for (const name of tags) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    let tag = get<{ id: string }>('SELECT id FROM tags WHERE name = ?', trimmed);
    if (!tag) {
      const tid = uid();
      run('INSERT INTO tags (id, name) VALUES (?, ?)', tid, trimmed);
      tag = { id: tid };
    }
    run('INSERT INTO question_tags (question_id, tag_id) VALUES (?, ?)', questionId, tag.id);
  }
}

function applyQuestion(row: QuestionRow, body: Partial<z.infer<typeof questionSchema>>) {
  const sets: string[] = [];
  const params: SQLInputValue[] = [];
  const fields: [string, string][] = [
    ['title', 'title'],
    ['type', 'type'],
    ['difficulty', 'difficulty'],
    ['categoryId', 'category_id'],
    ['explanation', 'explanation'],
    ['knowledgePoint', 'knowledge_point'],
    ['source', 'source'],
  ];
  for (const [k, col] of fields) {
    const v = (body as Record<string, unknown>)[k];
    if (v !== undefined) {
      sets.push(`${col} = ?`);
      params.push(v === undefined ? null : (v as SQLInputValue));
    }
  }
  if (body.options !== undefined) { sets.push('options = ?'); params.push(JSON.stringify(body.options)); }
  if (body.answer !== undefined) { sets.push('answer = ?'); params.push(JSON.stringify(body.answer)); }
  if (body.isPublic !== undefined) { sets.push('is_public = ?'); params.push(body.isPublic ? 1 : 0); }
  sets.push('updated_at = datetime(\'now\')');
  if (sets.length) {
    run(`UPDATE questions SET ${sets.join(', ')} WHERE id = ?`, ...params, row.id);
  }
}

questionsRouter.post('/', requireAuth, requireAdmin, (req, res) => {
  const body = questionSchema.parse(req.body);
  const id = uid();
  run(
    `INSERT INTO questions (id, title, type, difficulty, category_id, options, answer, explanation, knowledge_point, source, is_public, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    body.title,
    body.type,
    body.difficulty,
    body.categoryId ?? null,
    body.options ? JSON.stringify(body.options) : null,
    body.answer !== undefined ? JSON.stringify(body.answer) : null,
    body.explanation ?? null,
    body.knowledgePoint ?? null,
    body.source ?? null,
    body.isPublic === false ? 0 : 1,
    req.user!.sub,
  );
  if (body.tags) upsertTags(id, body.tags);
  const row = get<QuestionRow>(`${BASE_SELECT} WHERE q.id = ?`, id)!;
  res.status(201).json({ data: serializeDetail(row) });
});

questionsRouter.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const row = get<QuestionRow>(`${BASE_SELECT} WHERE q.id = ?`, req.params.id);
  if (!row) throw new AppError(404, '题目不存在', 'NOT_FOUND');
  const body = questionSchema.partial().parse(req.body);
  applyQuestion(row, body);
  if (body.tags) upsertTags(row.id, body.tags);
  const updated = get<QuestionRow>(`${BASE_SELECT} WHERE q.id = ?`, row.id)!;
  res.json({ data: serializeDetail(updated) });
});

/**
 * 删除题目。
 * 若题目已被练习记录（attempt_items）引用，则不能物理删除（会破坏历史成绩），
 * 改为归档（archived_at）并从题库中隐藏；否则直接物理删除。
 */
questionsRouter.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const id = req.params.id;
  const row = get<{ id: string }>('SELECT id FROM questions WHERE id = ?', id);
  if (!row) throw new AppError(404, '题目不存在', 'NOT_FOUND');

  const refs = Number(
    get<{ n: number }>('SELECT COUNT(*) AS n FROM attempt_items WHERE question_id = ?', id)?.n ?? 0,
  );

  if (refs > 0) {
    run("UPDATE questions SET archived_at = datetime('now'), is_public = 0 WHERE id = ?", id);
    res.json({ success: true, archived: true, message: `该题目已被 ${refs} 条作答记录引用，已归档处理` });
    return;
  }

  run('DELETE FROM questions WHERE id = ?', id);
  res.json({ success: true, archived: false });
});
