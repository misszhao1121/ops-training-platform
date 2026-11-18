import type { NextFunction, Request, Response } from 'express';
import { verifyToken, type JwtPayload } from './auth.js';
import { AppError } from './errors.js';
import { get } from './db.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new AppError(401, '未登录或缺少凭证', 'UNAUTHORIZED');
  }
  try {
    req.user = verifyToken(header.slice(7));
  } catch {
    throw new AppError(401, '登录已过期，请重新登录', 'UNAUTHORIZED');
  }
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) throw new AppError(401, '未登录', 'UNAUTHORIZED');
  const row = get<{ role: string }>('SELECT role FROM users WHERE id = ?', req.user.sub);
  if (!row || row.role !== 'ADMIN') {
    throw new AppError(403, '需要管理员权限', 'FORBIDDEN');
  }
  next();
}

/** 可选认证：携带有效 token 则解析，否则照常放行 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      req.user = verifyToken(header.slice(7));
    } catch {
      /* 忽略无效 token */
    }
  }
  next();
}
