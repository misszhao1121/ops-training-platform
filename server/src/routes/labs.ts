import { Router } from 'express';
import { z } from 'zod';
import type { SQLInputValue } from 'node:sqlite';
import { AppError } from '../errors.js';
import { all, get, run } from '../db.js';
import { requireAdmin, requireAuth, optionalAuth } from '../middleware.js';
import { uid, now, parseJson, toJson } from '../util.js';

export const labsRouter = Router();

/**
 * 实验环境模块。
 * 与真实 Docker / K8s 集群解耦：实验由「环境说明 + 任务步骤 + 判定规则」组成，
 * 用户在页面上按步骤执行并提交结果（命令输出 / 关键配置），由系统按规则自动判定。
 * 后续接入真实沙箱时，只需把判定来源从「用户提交文本」换成「沙箱实际状态」。
 */

interface LabTaskRow {
  id: string;
  title: string;
  description: string | null;
  environment: string | null;
  steps: string | null;
  answer: string | null;
  difficulty?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  estimated_minutes?: number | null;
  is_public?: number;
  created_at: string;
}

interface LabAttemptRow {
  id: string;
  user_id: string;
  lab_task_id: string;
  status: string;
  result: string | null;
  started_at: string;
  ended_at: string | null;
}

export interface LabStep {
  key: string;
  title: string;
  /** 该步骤的引导说明 */
  hint?: string;
  /** 判定关键字（用户提交内容需全部包含才判定通过） */
  expect?: string[];
}

const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

const LAB_SELECT = `
  SELECT t.*, c.name AS category_name
  FROM lab_tasks t
  LEFT JOIN categories c ON c.id = t.category_id
`;

function serializeTask(t: LabTaskRow, reveal: boolean) {
  const base: Record<string, unknown> = {
    id: t.id,
    title: t.title,
    description: t.description,
    difficulty: t.difficulty ?? 'medium',
    categoryId: t.category_id ?? null,
    categoryName: t.category_name ?? null,
    estimatedMinutes: t.estimated_minutes ?? null,
    environment: parseJson<Record<string, unknown>>(t.environment, {}),
    steps: parseJson<LabStep[]>(t.steps, []),
    isPublic: t.is_public !== 0,
    createdAt: t.created_at,
  };
  if (reveal) base.solution = parseJson<unknown>(t.answer, null);
  return base;
}

function ownAttempt(id: string, userId: string): LabAttemptRow {
  const a = get<LabAttemptRow>('SELECT * FROM lab_attempts WHERE id = ?', id);
  if (!a) throw new AppError(404, '实验记录不存在', 'NOT_FOUND');
  if (a.user_id !== userId) throw new AppError(403, '无权访问该实验记录', 'FORBIDDEN');
  return a;
}

// ===== 实验列表 =====
labsRouter.get('/tasks', optionalAuth, (req, res) => {
  const conditions: string[] = [];
  const params: SQLInputValue[] = [];
  const includeAll = req.query.includeAll === 'true' && req.user?.role === 'ADMIN';
  if (!includeAll) conditions.push('t.is_public = 1');
  if (req.query.difficulty) {
    conditions.push('t.difficulty = ?');
    params.push(String(req.query.difficulty));
  }
  if (req.query.categoryId) {
    conditions.push('t.category_id = ?');
    params.push(String(req.query.categoryId));
  }
  if (req.query.q) {
    conditions.push('(t.title LIKE ? OR t.description LIKE ?)');
    const kw = `%${String(req.query.q)}%`;
    params.push(kw, kw);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = all<LabTaskRow>(`${LAB_SELECT} ${where} ORDER BY t.created_at DESC`, ...params);
  res.json({ data: rows.map((r) => serializeTask(r, false)) });
});

// ===== 实验详情 =====
labsRouter.get('/tasks/:id', optionalAuth, (req, res) => {
  const row = get<LabTaskRow>(`${LAB_SELECT} WHERE t.id = ?`, req.params.id);
  if (!row) throw new AppError(404, '实验不存在', 'NOT_FOUND');
  if (row.is_public === 0 && req.user?.role !== 'ADMIN') {
    throw new AppError(404, '实验不存在', 'NOT_FOUND');
  }
  res.json({ data: serializeTask(row, req.user?.role === 'ADMIN') });
});

// ===== 管理员：创建 / 更新 / 删除实验 =====
const taskSchema = z.object({
  title: z.string().min(1, '标题不能为空').max(120),
  description: z.string().max(2000).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  categoryId: z.string().nullable().optional(),
  estimatedMinutes: z.number().int().min(1).max(600).optional(),
  environment: z.record(z.unknown()).optional(),
  steps: z
    .array(
      z.object({
        key: z.string(),
        title: z.string(),
        hint: z.string().optional(),
        expect: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  solution: z.unknown().optional(),
  isPublic: z.boolean().optional(),
});

labsRouter.post('/tasks', requireAuth, requireAdmin, (req, res) => {
  const body = taskSchema.parse(req.body);
  const id = uid();
  run(
    `INSERT INTO lab_tasks (id, title, description, environment, steps, answer, difficulty, category_id, estimated_minutes, is_public)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    body.title,
    body.description ?? null,
    toJson(body.environment ?? {}),
    toJson(body.steps ?? []),
    body.solution === undefined ? null : toJson(body.solution),
    body.difficulty ?? 'medium',
    body.categoryId ?? null,
    body.estimatedMinutes ?? null,
    body.isPublic === false ? 0 : 1,
  );
  const row = get<LabTaskRow>(`${LAB_SELECT} WHERE t.id = ?`, id)!;
  res.status(201).json({ data: serializeTask(row, true) });
});

labsRouter.put('/tasks/:id', requireAuth, requireAdmin, (req, res) => {
  const id = req.params.id;
  if (!get('SELECT id FROM lab_tasks WHERE id = ?', id)) {
    throw new AppError(404, '实验不存在', 'NOT_FOUND');
  }
  const body = taskSchema.partial().parse(req.body);
  const sets: string[] = [];
  const params: SQLInputValue[] = [];
  const simple: [keyof typeof body, string][] = [
    ['title', 'title'],
    ['description', 'description'],
    ['difficulty', 'difficulty'],
    ['categoryId', 'category_id'],
    ['estimatedMinutes', 'estimated_minutes'],
  ];
  for (const [k, col] of simple) {
    const v = (body as Record<string, unknown>)[k];
    if (v !== undefined) {
      sets.push(`${col} = ?`);
      params.push(v as SQLInputValue);
    }
  }
  if (body.environment !== undefined) {
    sets.push('environment = ?');
    params.push(toJson(body.environment));
  }
  if (body.steps !== undefined) {
    sets.push('steps = ?');
    params.push(toJson(body.steps));
  }
  if (body.solution !== undefined) {
    sets.push('answer = ?');
    params.push(toJson(body.solution));
  }
  if (body.isPublic !== undefined) {
    sets.push('is_public = ?');
    params.push(body.isPublic ? 1 : 0);
  }
  if (sets.length) {
    run(`UPDATE lab_tasks SET ${sets.join(', ')} WHERE id = ?`, ...params, id);
  }
  const row = get<LabTaskRow>(`${LAB_SELECT} WHERE t.id = ?`, id)!;
  res.json({ data: serializeTask(row, true) });
});

labsRouter.delete('/tasks/:id', requireAuth, requireAdmin, (req, res) => {
  const id = req.params.id;
  if (!get('SELECT id FROM lab_tasks WHERE id = ?', id)) {
    throw new AppError(404, '实验不存在', 'NOT_FOUND');
  }
  // 实验记录随任务级联删除（schema 中 ON DELETE CASCADE）
  run('DELETE FROM lab_tasks WHERE id = ?', id);
  res.json({ success: true });
});

// ===== 开始一次实验 =====
labsRouter.post('/attempts', requireAuth, (req, res) => {
  const body = z.object({ taskId: z.string() }).parse(req.body);
  const task = get<LabTaskRow>(`${LAB_SELECT} WHERE t.id = ?`, body.taskId);
  if (!task || task.is_public === 0) {
    throw new AppError(404, '实验不存在', 'NOT_FOUND');
  }

  // 复用进行中的记录，避免重复创建
  const existing = get<LabAttemptRow>(
    "SELECT * FROM lab_attempts WHERE user_id = ? AND lab_task_id = ? AND status = 'in_progress'",
    req.user!.sub,
    task.id,
  );
  if (existing) {
    res.json({
      data: {
        id: existing.id,
        taskId: task.id,
        status: existing.status,
        result: parseJson<Record<string, unknown>>(existing.result, {}),
        startedAt: existing.started_at,
        task: serializeTask(task, false),
      },
    });
    return;
  }

  const id = uid();
  run(
    'INSERT INTO lab_attempts (id, user_id, lab_task_id, status, result) VALUES (?, ?, ?, ?, ?)',
    id,
    req.user!.sub,
    task.id,
    'in_progress',
    toJson({ stepResults: {} }),
  );
  const created = get<LabAttemptRow>('SELECT * FROM lab_attempts WHERE id = ?', id)!;
  res.status(201).json({
    data: {
      id: created.id,
      taskId: task.id,
      status: created.status,
      result: parseJson<Record<string, unknown>>(created.result, {}),
      startedAt: created.started_at,
      task: serializeTask(task, false),
    },
  });
});

// ===== 我的实验记录 =====
labsRouter.get('/attempts', requireAuth, (req, res) => {
  const rows = all<LabAttemptRow & { title: string; difficulty: string | null }>(
    `SELECT a.*, t.title, t.difficulty FROM lab_attempts a
     JOIN lab_tasks t ON t.id = a.lab_task_id
     WHERE a.user_id = ? ORDER BY a.started_at DESC LIMIT 100`,
    req.user!.sub,
  );
  res.json({
    data: rows.map((r) => ({
      id: r.id,
      taskId: r.lab_task_id,
      title: r.title,
      difficulty: r.difficulty ?? 'medium',
      status: r.status,
      passedSteps: Object.values(parseJson<Record<string, boolean>>(r.result, {}) as Record<string, unknown>)
        .filter((v) => v === true).length,
      startedAt: r.started_at,
      endedAt: r.ended_at,
    })),
  });
});

// ===== 实验详情（含当前用户进度）=====
labsRouter.get('/attempts/:id', requireAuth, (req, res) => {
  const a = ownAttempt(req.params.id, req.user!.sub);
  const task = get<LabTaskRow>(`${LAB_SELECT} WHERE t.id = ?`, a.lab_task_id);
  if (!task) throw new AppError(404, '实验不存在', 'NOT_FOUND');
  res.json({
    data: {
      id: a.id,
      taskId: a.lab_task_id,
      status: a.status,
      result: parseJson<Record<string, unknown>>(a.result, {}),
      startedAt: a.started_at,
      endedAt: a.ended_at,
      task: serializeTask(task, a.status === 'completed'),
    },
  });
});

// ===== 提交某一步的执行结果，自动判定 =====
const stepSubmitSchema = z.object({
  stepKey: z.string(),
  output: z.string().max(4000),
});

labsRouter.post('/attempts/:id/steps', requireAuth, (req, res) => {
  const a = ownAttempt(req.params.id, req.user!.sub);
  if (a.status === 'completed') {
    throw new AppError(400, '该实验已完成，无法继续提交', 'COMPLETED');
  }
  const body = stepSubmitSchema.parse(req.body);
  const task = get<LabTaskRow>(`${LAB_SELECT} WHERE t.id = ?`, a.lab_task_id);
  if (!task) throw new AppError(404, '实验不存在', 'NOT_FOUND');

  const steps = parseJson<LabStep[]>(task.steps, []);
  const step = steps.find((s) => s.key === body.stepKey);
  if (!step) throw new AppError(404, '该步骤不存在', 'NOT_FOUND');

  const output = body.output.trim();
  const expects = step.expect ?? [];
  const matched = expects.filter((k) => output.includes(k));
  const passed = expects.length === 0 ? output.length > 0 : matched.length === expects.length;

  const result = parseJson<{
    stepResults?: Record<string, { passed: boolean; output: string; matched?: string[]; submittedAt: string }>;
  }>(a.result, { stepResults: {} });
  result.stepResults = result.stepResults ?? {};
  result.stepResults[step.key] = {
    passed,
    output,
    matched,
    submittedAt: now(),
  };

  // 全部步骤通过则自动完成
  const allPassed = steps.length > 0 && steps.every((s) => result.stepResults![s.key]?.passed === true);
  const status = allPassed ? 'completed' : 'in_progress';
  run(
    'UPDATE lab_attempts SET result = ?, status = ?, ended_at = ? WHERE id = ?',
    toJson(result),
    status,
    allPassed ? now() : null,
    a.id,
  );

  res.json({
    data: {
      stepKey: step.key,
      passed,
      matched,
      expected: expects,
      allPassed,
      status,
      message: passed
        ? '本步骤通过'
        : expects.length
          ? `未通过，需包含关键信息：${expects.filter((e) => !matched.includes(e)).join('、')}`
          : '请输入执行结果',
    },
  });
});

// ===== 放弃实验 =====
labsRouter.delete('/attempts/:id', requireAuth, (req, res) => {
  const a = ownAttempt(req.params.id, req.user!.sub);
  run('DELETE FROM lab_attempts WHERE id = ?', a.id);
  res.json({ success: true });
});