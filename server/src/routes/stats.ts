import { Router } from 'express';
import { all, get } from '../db.js';
import { requireAuth } from '../middleware.js';

export const statsRouter = Router();

statsRouter.get('/overview', requireAuth, (req, res) => {
  const userId = req.user!.sub;

  const personal = get<{
    attemptCount: number;
    completedCount: number;
    avgScore: number | null;
    correctCount: number;
    totalCount: number;
  }>(
    `SELECT COUNT(*) AS attemptCount,
            COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) AS completedCount,
            AVG(CASE WHEN status = 'completed' THEN score END) AS avgScore,
            COALESCE(SUM(correct), 0) AS correctCount,
            COALESCE(SUM(total), 0) AS totalCount
     FROM attempts WHERE user_id = ?`,
    userId,
  );

  const byDifficulty = all(
    `SELECT difficulty, COUNT(*) AS n FROM questions WHERE is_public = 1 AND archived_at IS NULL GROUP BY difficulty`,
  );
  const byType = all(
    `SELECT type, COUNT(*) AS n FROM questions WHERE is_public = 1 AND archived_at IS NULL GROUP BY type`,
  );
  const topCategories = all(
    `SELECT c.name, COUNT(q.id) AS n
     FROM categories c LEFT JOIN questions q ON q.category_id = c.id AND q.is_public = 1 AND q.archived_at IS NULL
     GROUP BY c.id ORDER BY n DESC LIMIT 8`,
  );

  const platform = {
    questionCount: Number(get<{ n: number }>('SELECT COUNT(*) AS n FROM questions WHERE is_public = 1 AND archived_at IS NULL')?.n ?? 0),
    categoryCount: Number(get<{ n: number }>('SELECT COUNT(*) AS n FROM categories')?.n ?? 0),
    tagCount: Number(get<{ n: number }>('SELECT COUNT(*) AS n FROM tags')?.n ?? 0),
    userCount: Number(get<{ n: number }>('SELECT COUNT(*) AS n FROM users')?.n ?? 0),
  };

  const totalCount = Number(personal?.totalCount ?? 0);
  const correctCount = Number(personal?.correctCount ?? 0);

  res.json({
    data: {
      personal: {
        attemptCount: Number(personal?.attemptCount ?? 0),
        completedCount: Number(personal?.completedCount ?? 0),
        avgScore: personal?.avgScore == null ? null : Math.round(Number(personal.avgScore)),
        correctCount,
        totalCount,
        accuracy: totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : null,
      },
      platform,
      byDifficulty,
      byType,
      topCategories,
    },
  });
});
