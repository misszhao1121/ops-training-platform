import { Router } from 'express';
import { z } from 'zod';
import { hashPassword, verifyPassword, signToken } from '../auth.js';
import { AppError } from '../errors.js';
import { get, run } from '../db.js';
import { requireAuth } from '../middleware.js';
import { uid } from '../util.js';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email('邮箱格式不正确'),
  username: z
    .string()
    .min(3, '用户名至少 3 个字符')
    .max(20, '用户名最多 20 个字符')
    .regex(/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/, '用户名仅支持中英文、数字、下划线'),
  password: z.string().min(6, '密码至少 6 位').max(72, '密码过长'),
});

const loginSchema = z.object({
  account: z.string().min(1, '请输入用户名或邮箱'),
  password: z.string().min(1, '请输入密码'),
});

function publicUser(row: Record<string, unknown>) {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    role: row.role,
    createdAt: row.created_at,
  };
}

authRouter.post('/register', (req, res) => {
  const body = registerSchema.parse(req.body);
  const existing = get('SELECT id FROM users WHERE email = ? OR username = ?', body.email, body.username);
  if (existing) {
    throw new AppError(409, '邮箱或用户名已被注册', 'CONFLICT');
  }
  const id = uid();
  run(
    'INSERT INTO users (id, email, username, password_hash, role) VALUES (?, ?, ?, ?, ?)',
    id,
    body.email.toLowerCase(),
    body.username,
    hashPassword(body.password),
    'USER',
  );
  const user = get('SELECT * FROM users WHERE id = ?', id)!;
  const token = signToken({ sub: id, role: 'USER', username: body.username });
  res.status(201).json({ token, user: publicUser(user) });
});

authRouter.post('/login', (req, res) => {
  const body = loginSchema.parse(req.body);
  const account = body.account.toLowerCase();
  const user = get(
    'SELECT * FROM users WHERE email = ? OR username = ?',
    account,
    body.account,
  );
  if (!user || !verifyPassword(body.password, String(user.password_hash))) {
    throw new AppError(401, '账号或密码错误', 'INVALID_CREDENTIALS');
  }
  const token = signToken({ sub: String(user.id), role: String(user.role), username: String(user.username) });
  res.json({ token, user: publicUser(user) });
});

authRouter.get('/me', requireAuth, (req, res) => {
  const user = get('SELECT * FROM users WHERE id = ?', req.user!.sub);
  if (!user) throw new AppError(401, '用户不存在', 'UNAUTHORIZED');
  const stats = get(
    `SELECT COUNT(*) AS attemptCount,
            COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) AS completedCount,
            COALESCE(SUM(correct), 0) AS correctCount,
            COALESCE(SUM(total), 0) AS totalCount
     FROM attempts WHERE user_id = ?`,
    user.id,
  );
  res.json({
    user: publicUser(user),
    stats: {
      attemptCount: Number(stats?.attemptCount ?? 0),
      completedCount: Number(stats?.completedCount ?? 0),
      correctCount: Number(stats?.correctCount ?? 0),
      totalCount: Number(stats?.totalCount ?? 0),
    },
  });
});

// 修改密码
const passwordSchema = z.object({
  oldPassword: z.string().min(1, '请输入原密码'),
  newPassword: z.string().min(6, '新密码至少 6 位').max(72, '密码过长'),
});

authRouter.post('/password', requireAuth, (req, res) => {
  const body = passwordSchema.parse(req.body);
  const user = get('SELECT * FROM users WHERE id = ?', req.user!.sub);
  if (!user || !verifyPassword(body.oldPassword, String(user.password_hash))) {
    throw new AppError(400, '原密码不正确', 'INVALID_CREDENTIALS');
  }
  run(
    "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?",
    hashPassword(body.newPassword),
    req.user!.sub,
  );
  res.json({ success: true });
});
