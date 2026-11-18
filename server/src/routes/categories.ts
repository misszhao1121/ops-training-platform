import { Router } from 'express';
import { z } from 'zod';
import type { SQLInputValue } from 'node:sqlite';
import { AppError } from '../errors.js';
import { all, get, run } from '../db.js';
import { requireAdmin, requireAuth } from '../middleware.js';
import { uid } from '../util.js';

export const categoriesRouter = Router();

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  sort_order: number;
  question_count?: number;
  children?: CategoryRow[];
}

function buildTree(rows: CategoryRow[]): CategoryRow[] {
  const map = new Map<string, CategoryRow>();
  for (const r of rows) map.set(r.id, { ...r, children: [] });
  const roots: CategoryRow[] = [];
  for (const r of map.values()) {
    if (r.parent_id && map.has(r.parent_id)) {
      map.get(r.parent_id)!.children!.push(r);
    } else {
      roots.push(r);
    }
  }
  const sortRec = (list: CategoryRow[]) => {
    list.sort((a, b) => a.sort_order - b.sort_order);
    list.forEach((n) => sortRec(n.children ?? []));
  };
  sortRec(roots);
  return roots;
}

// 分类树（含题目数量）
categoriesRouter.get('/', (_req, res) => {
  const rows = all<CategoryRow>(
    `SELECT c.*,
            (SELECT COUNT(*) FROM questions q WHERE q.category_id = c.id AND q.archived_at IS NULL) AS question_count
     FROM categories c ORDER BY c.sort_order, c.name`,
  );
  res.json({ data: buildTree(rows) });
});

const categorySchema = z.object({
  name: z.string().min(1, '分类名不能为空').max(50),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'slug 仅支持小写字母、数字、连字符'),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

categoriesRouter.post('/', requireAuth, requireAdmin, (req, res) => {
  const body = categorySchema.parse(req.body);
  const id = uid();
  run(
    'INSERT INTO categories (id, name, slug, parent_id, sort_order) VALUES (?, ?, ?, ?, ?)',
    id,
    body.name,
    body.slug,
    body.parentId ?? null,
    body.sortOrder ?? 0,
  );
  res.status(201).json({ data: get('SELECT * FROM categories WHERE id = ?', id) });
});

categoriesRouter.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const body = categorySchema.partial().parse(req.body);
  const id = req.params.id;
  if (!get('SELECT id FROM categories WHERE id = ?', id)) {
    throw new AppError(404, '分类不存在', 'NOT_FOUND');
  }
  const sets: string[] = [];
  const params: SQLInputValue[] = [];
  if (body.name !== undefined) { sets.push('name = ?'); params.push(body.name); }
  if (body.slug !== undefined) { sets.push('slug = ?'); params.push(body.slug); }
  if (body.parentId !== undefined) { sets.push('parent_id = ?'); params.push(body.parentId); }
  if (body.sortOrder !== undefined) { sets.push('sort_order = ?'); params.push(body.sortOrder); }
  if (sets.length) {
    run(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`, ...params, id);
  }
  res.json({ data: get('SELECT * FROM categories WHERE id = ?', id) });
});

categoriesRouter.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const id = req.params.id;
  if (get('SELECT id FROM questions WHERE category_id = ? LIMIT 1', id)) {
    throw new AppError(409, '该分类下仍有题目，无法删除', 'CONFLICT');
  }
  run('UPDATE categories SET parent_id = NULL WHERE parent_id = ?', id);
  run('DELETE FROM categories WHERE id = ?', id);
  res.json({ success: true });
});
