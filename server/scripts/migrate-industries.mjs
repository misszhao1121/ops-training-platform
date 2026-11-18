/**
 * 行业体系迁移（幂等，可重复执行）：
 * 1. 创建行业一级分类（运维/计算机/护理/金融）
 * 2. 把现有顶级技术分类挂到"运维"行业下
 * 3. 补建计算机/护理/金融子分类与示例题目
 *
 * 运行：node scripts/migrate-industries.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { INDUSTRIES, CATEGORIES, TAGS, QUESTIONS } from '../dist/seed.js';

const DB_FILE = new URL('../data/ops-training.db', import.meta.url).pathname
  .replace(/^\/([A-Za-z]:)/, '$1'); // Windows 路径修正

if (!existsSync(DB_FILE)) {
  console.error(`[migrate] 数据库不存在：${DB_FILE}`);
  process.exit(1);
}

const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA foreign_keys = ON;');

const uid = () => randomUUID();
const get = (sql, ...params) => db.prepare(sql).get(...params);
const run = (sql, ...params) => db.prepare(sql).run(...params);

// 1. 行业一级分类
const industryIdBySlug = new Map();
let industriesCreated = 0;
for (const [i, ind] of INDUSTRIES.entries()) {
  const existing = get('SELECT id FROM categories WHERE slug = ?', ind.slug);
  if (existing) {
    industryIdBySlug.set(ind.slug, existing.id);
  } else {
    const id = uid();
    run(
      'INSERT INTO categories (id, name, slug, parent_id, sort_order) VALUES (?, ?, ?, NULL, ?)',
      id, ind.name, ind.slug, i,
    );
    industryIdBySlug.set(ind.slug, id);
    industriesCreated += 1;
  }
}
console.log(`[migrate] 行业分类：新建 ${industriesCreated} 个，共 ${industryIdBySlug.size} 个`);

const opsIndustryId = industryIdBySlug.get('industry-ops');

// 2. 现有顶级分类挂到运维行业下（排除行业本身）
const adopted = run(
  `UPDATE categories SET parent_id = ?
   WHERE parent_id IS NULL AND slug NOT IN (${INDUSTRIES.map(() => '?').join(',')})`,
  opsIndustryId,
  ...INDUSTRIES.map((i) => i.slug),
);
console.log(`[migrate] 已挂到「运维」行业下的既有分类：${adopted.changes} 个`);

// 3. 子分类（按 slug 幂等）
const catIdBySlug = new Map(industryIdBySlug);
let catsCreated = 0;
for (const c of CATEGORIES) {
  const existing = get('SELECT id FROM categories WHERE slug = ?', c.slug);
  if (existing) {
    catIdBySlug.set(c.slug, existing.id);
  } else {
    const id = uid();
    run(
      'INSERT INTO categories (id, name, slug, parent_id, sort_order) VALUES (?, ?, ?, ?, ?)',
      id, c.name, c.slug, industryIdBySlug.get(c.parent) ?? null, catIdBySlug.size,
    );
    catIdBySlug.set(c.slug, id);
    catsCreated += 1;
  }
}
console.log(`[migrate] 子分类：新建 ${catsCreated} 个，共 ${CATEGORIES.length} 个`);

// 4. 标签（按名幂等）
const tagIdByName = new Map();
for (const t of TAGS) {
  const existing = get('SELECT id FROM tags WHERE name = ?', t);
  if (existing) tagIdByName.set(t, existing.id);
  else {
    const id = uid();
    run('INSERT INTO tags (id, name) VALUES (?, ?)', id, t);
    tagIdByName.set(t, id);
  }
}

// 5. 新行业示例题（按题干幂等）
let created = 0;
for (const q of QUESTIONS) {
  const existing = get('SELECT id FROM questions WHERE title = ?', q.title);
  if (existing) continue;
  const id = uid();
  run(
    `INSERT INTO questions (id, title, type, difficulty, category_id, options, answer, explanation, knowledge_point, source, is_public)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    id,
    q.title,
    q.type,
    q.difficulty,
    catIdBySlug.get(q.category) ?? null,
    q.options ? JSON.stringify(q.options) : null,
    JSON.stringify(q.answer),
    q.explanation ?? null,
    q.knowledgePoint ?? null,
    q.source ?? null,
  );
  for (const t of q.tags) {
    let tid = tagIdByName.get(t);
    if (!tid) {
      tid = uid();
      run('INSERT INTO tags (id, name) VALUES (?, ?)', tid, t);
      tagIdByName.set(t, tid);
    }
    run('INSERT OR IGNORE INTO question_tags (question_id, tag_id) VALUES (?, ?)', id, tid);
  }
  created += 1;
}
console.log(`[migrate] 示例题目：新增 ${created} 道（按题干去重）`);

// 6. 校验行业分布
const rows = db
  .prepare(
    `SELECT ind.name AS industry, COUNT(q.id) AS n
     FROM categories ind
     LEFT JOIN categories c ON c.parent_id = ind.id
     LEFT JOIN questions q ON q.category_id = c.id AND q.archived_at IS NULL
     WHERE ind.parent_id IS NULL
     GROUP BY ind.id ORDER BY ind.sort_order`,
  )
  .all();
console.log('\n[migrate] 各行业题目数（挂在其子分类下的公开题）：');
for (const r of rows) console.log(`  ${r.industry}: ${r.n} 题`);

db.close();
console.log('\n[migrate] 完成 ✓');
