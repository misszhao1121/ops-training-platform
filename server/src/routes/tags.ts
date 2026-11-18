import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../errors.js';
import { all, get, run } from '../db.js';
import { requireAdmin, requireAuth } from '../middleware.js';
import { uid } from '../util.js';

export const tagsRouter = Router();

tagsRouter.get('/', (_req, res) => {
  const rows = all(
    `SELECT t.*, (SELECT COUNT(*) FROM question_tags qt WHERE qt.tag_id = t.id) AS question_count
     FROM tags t ORDER BY t.name`,
  );
  res.json({ data: rows });
});

const tagSchema = z.object({ name: z.string().min(1).max(30) });

tagsRouter.post('/', requireAuth, requireAdmin, (req, res) => {
  const body = tagSchema.parse(req.body);
  const existing = get('SELECT id FROM tags WHERE name = ?', body.name);
  if (existing) throw new AppError(409, '标签已存在', 'CONFLICT');
  const id = uid();
  run('INSERT INTO tags (id, name) VALUES (?, ?)', id, body.name);
  res.status(201).json({ data: get('SELECT * FROM tags WHERE id = ?', id) });
});

tagsRouter.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  run('DELETE FROM question_tags WHERE tag_id = ?', req.params.id);
  run('DELETE FROM tags WHERE id = ?', req.params.id);
  res.json({ success: true });
});
