/**
 * 数据库 DDL。所有表使用 IF NOT EXISTS，启动时按序执行，天然可重复迁移。
 * 预留了面试会话、实验任务、实验作答三组表，后续迭代直接启用。
 */
export const SCHEMA_SQL = /* sql */ `
-- 用户
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'USER',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 题库分类（支持父子层级，parent_id 自引用）
CREATE TABLE IF NOT EXISTS categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  slug       TEXT NOT NULL UNIQUE,
  parent_id  TEXT REFERENCES categories(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 标签
CREATE TABLE IF NOT EXISTS tags (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

-- 题目
CREATE TABLE IF NOT EXISTS questions (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  type            TEXT NOT NULL,             -- single_choice | multiple_choice | true_false | fill_blank | short_answer
  difficulty      TEXT NOT NULL,             -- easy | medium | hard
  category_id     TEXT REFERENCES categories(id) ON DELETE SET NULL,
  options         TEXT,                      -- JSON 字符串：选项列表
  answer          TEXT,                      -- JSON 字符串：标准答案
  explanation     TEXT,                      -- 解析
  knowledge_point TEXT,                      -- 考点
  source          TEXT,                      -- 来源（面试/笔试/生产经验等）
  is_public       INTEGER NOT NULL DEFAULT 1,
  created_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  archived_at     TEXT,                      -- 软删除时间；非空表示已归档
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 题目-标签 多对多
CREATE TABLE IF NOT EXISTS question_tags (
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  tag_id      TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (question_id, tag_id)
);

-- 一次练习 / 考试
CREATE TABLE IF NOT EXISTS attempts (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode       TEXT NOT NULL,                  -- practice | exam
  title      TEXT,
  status     TEXT NOT NULL DEFAULT 'in_progress', -- in_progress | completed
  total      INTEGER NOT NULL DEFAULT 0,
  correct    INTEGER,
  score      INTEGER,                        -- 0..100
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at   TEXT
);

-- 练习作答明细
CREATE TABLE IF NOT EXISTS attempt_items (
  id          TEXT PRIMARY KEY,
  attempt_id  TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id),
  position    INTEGER NOT NULL,
  user_answer TEXT,                          -- JSON
  is_correct  INTEGER,
  answered_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_attempt_items_attempt ON attempt_items(attempt_id);
CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_questions_category ON questions(category_id);

-- 错题本：答错自动收题，重做答对后标记已掌握
CREATE TABLE IF NOT EXISTS wrong_book (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id  TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  wrong_count  INTEGER NOT NULL DEFAULT 1,
  last_wrong_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at  TEXT,                          -- 非空表示重做答对（已掌握）
  PRIMARY KEY (user_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_wrong_book_user ON wrong_book(user_id);

-- 题目收藏
CREATE TABLE IF NOT EXISTS favorites (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);

-- ===== 以下为面试 / 实验模块预留 =====

-- 面试会话（对话记录存 JSON）
CREATE TABLE IF NOT EXISTS interview_sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic      TEXT,
  status     TEXT NOT NULL DEFAULT 'in_progress', -- in_progress | completed
  messages   TEXT,                               -- JSON 对话
  question_ids TEXT,                             -- JSON：抽到的题目 id 数组
  answers    TEXT,                               -- JSON：逐题作答与评分
  score      INTEGER,
  feedback   TEXT,                               -- JSON 反馈
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_interview_user ON interview_sessions(user_id);

-- 实验任务定义
CREATE TABLE IF NOT EXISTS lab_tasks (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  description       TEXT,
  difficulty        TEXT NOT NULL DEFAULT 'medium', -- easy | medium | hard
  category_id       TEXT REFERENCES categories(id) ON DELETE SET NULL,
  estimated_minutes INTEGER,
  environment       TEXT,                           -- JSON：环境配置
  steps             TEXT,                           -- JSON：任务步骤
  answer            TEXT,                           -- JSON：参考答案/判定脚本
  is_public         INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 实验作答记录
CREATE TABLE IF NOT EXISTS lab_attempts (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lab_task_id TEXT NOT NULL REFERENCES lab_tasks(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'in_progress', -- in_progress | completed
  result      TEXT,                              -- JSON 作答结果
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_lab_attempts_user ON lab_attempts(user_id);
`;
