import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const dbFile = path.resolve('E:/aixiangmu/dsk/ops-training-platform/server/data/ops-training.db');
const db = new DatabaseSync(dbFile);
db.exec('PRAGMA foreign_keys = ON;');

// 找出所有测试题目（标题以 E2E 开头，或包含乱码问号）
const candidates = db.prepare("SELECT id, title, archived_at FROM questions WHERE title LIKE 'E2E%' OR title LIKE '%?%'").all();
console.log(`找到测试题目 ${candidates.length} 条：`);

let deleted = 0, archived = 0, failed = 0;
for (const q of candidates) {
  console.log(`- ${q.title} (${q.id}) archived=${q.archived_at}`);
  const refs = db.prepare('SELECT COUNT(*) AS n FROM attempt_items WHERE question_id = ?').get(q.id).n;
  if (refs > 0) {
    // 有作答记录：归档隐藏
    db.prepare("UPDATE questions SET archived_at = datetime('now'), is_public = 0 WHERE id = ?").run(q.id);
    archived++;
    console.log(`  -> 归档（${refs} 条作答记录）`);
  } else {
    db.prepare('DELETE FROM question_tags WHERE question_id = ?').run(q.id);
    db.prepare('DELETE FROM questions WHERE id = ?').run(q.id);
    deleted++;
    console.log('  -> 物理删除');
  }
}

// 清理孤立标签（无题目引用）
const orphanTags = db.prepare('SELECT t.id, t.name FROM tags t WHERE NOT EXISTS (SELECT 1 FROM question_tags qt WHERE qt.tag_id = t.id)').all();
for (const t of orphanTags) {
  db.prepare('DELETE FROM tags WHERE id = ?').run(t.id);
  console.log(`- 删除孤立标签: ${t.name}`);
}

console.log(`\n完成：删除 ${deleted}，归档 ${archived}，失败 ${failed}`);
const remain = db.prepare('SELECT COUNT(*) AS n FROM questions WHERE archived_at IS NULL AND is_public = 1').get();
console.log(`当前公开有效题目数: ${remain.n}`);
const sample = db.prepare('SELECT title FROM questions WHERE archived_at IS NULL AND is_public = 1 LIMIT 3').all();
for (const s of sample) console.log(`  样例: ${s.title}`);
