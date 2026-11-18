import { randomUUID } from 'node:crypto';

export function uid(): string {
  return randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}

/** 安全解析 JSON 字段（数据库里存的是字符串，可能为 null） */
export function parseJson<T = unknown>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function toJson(value: unknown): string {
  return JSON.stringify(value);
}

export function clampInt(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}
