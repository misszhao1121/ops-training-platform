import type { NextFunction, Request, Response } from 'express';

export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, message: string, code = 'ERROR', details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ code: 'NOT_FOUND', message: '接口不存在' });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ code: err.code, message: err.message, details: err.details });
    return;
  }
  // SQLite 唯一约束冲突等
  if (err instanceof Error && /UNIQUE constraint failed/i.test(err.message)) {
    res.status(409).json({ code: 'CONFLICT', message: '数据已存在（唯一性冲突）' });
    return;
  }
  console.error('[server error]', err);
  res.status(500).json({ code: 'INTERNAL', message: '服务器内部错误' });
}
