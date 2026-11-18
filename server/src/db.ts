import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { SCHEMA_SQL } from './schema.js';

let db: DatabaseSync | null = null;

/**
 * 轻量迁移：对已存在的旧库补齐新增列。
 * 使用 PRAGMA table_info 判断列是否存在，保证可重复执行。
 */
const COLUMN_MIGRATIONS: { table: string; column: string; ddl: string }[] = [
  // 题目软删除：被练习记录引用的题目不能物理删除，改为归档
  { table: 'questions', column: 'archived_at', ddl: 'ALTER TABLE questions ADD COLUMN archived_at TEXT' },
  // 自适应练习：创建时的抽题范围（JSON，供动态追加题目时复用）
  { table: 'attempts', column: 'filters', ddl: 'ALTER TABLE attempts ADD COLUMN filters TEXT' },
  // 面试会话：抽取的题目 id 列表（JSON 数组字符串）
  { table: 'interview_sessions', column: 'question_ids', ddl: 'ALTER TABLE interview_sessions ADD COLUMN question_ids TEXT' },
  // 面试会话：逐题作答与评分记录（JSON 数组字符串）
  { table: 'interview_sessions', column: 'answers', ddl: 'ALTER TABLE interview_sessions ADD COLUMN answers TEXT' },
  // 实验任务：难度 / 分类 / 预计时长 / 是否公开
  { table: 'lab_tasks', column: 'difficulty', ddl: "ALTER TABLE lab_tasks ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'medium'" },
  { table: 'lab_tasks', column: 'category_id', ddl: 'ALTER TABLE lab_tasks ADD COLUMN category_id TEXT REFERENCES categories(id) ON DELETE SET NULL' },
  { table: 'lab_tasks', column: 'estimated_minutes', ddl: 'ALTER TABLE lab_tasks ADD COLUMN estimated_minutes INTEGER' },
  { table: 'lab_tasks', column: 'is_public', ddl: 'ALTER TABLE lab_tasks ADD COLUMN is_public INTEGER NOT NULL DEFAULT 1' },
];

function columnExists(conn: DatabaseSync, table: string, column: string): boolean {
  const rows = conn.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((r) => r.name === column);
}

function migrate(conn: DatabaseSync): void {
  for (const m of COLUMN_MIGRATIONS) {
    if (!columnExists(conn, m.table, m.column)) {
      conn.exec(m.ddl);
      console.log(`[db] migrated: ${m.table}.${m.column}`);
    }
  }
}

export function getDb(): DatabaseSync {
  if (db) return db;
  const dir = path.dirname(config.dbFile);
  fs.mkdirSync(dir, { recursive: true });
  db = new DatabaseSync(config.dbFile);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA_SQL);
  migrate(db);
  return db;
}

/** 执行多条 SQL（迁移/建表） */
export function exec(sql: string): void {
  getDb().exec(sql);
}

/**
 * 查询多行。
 * 参数类型放宽为 unknown，内部再断言为 SQLInputValue，
 * 避免每个调用点都做一次类型转换。
 */
export function all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
  return getDb().prepare(sql).all(...(params as SQLInputValue[])) as T[];
}

/** 查询单行 */
export function get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined {
  return getDb().prepare(sql).get(...(params as SQLInputValue[])) as T | undefined;
}

/** 执行写操作，返回受影响行数与 lastInsertRowid */
export function run(sql: string, ...params: unknown[]): { changes: number; lastInsertRowid: number | bigint } {
  const res = getDb().prepare(sql).run(...(params as SQLInputValue[]));
  return { changes: Number(res.changes), lastInsertRowid: res.lastInsertRowid };
}