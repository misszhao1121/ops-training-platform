/**
 * 判题逻辑。
 * 客观题（单选/多选/判断/填空）返回 true/false；
 * 主观题（简答）返回 null，表示「待人工评阅」，不计入分数。
 */

function normalize(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}

function asKeyArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string') {
    return v
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return v == null ? [] : [String(v)];
}

export function gradeQuestion(type: string, answer: unknown, userAnswer: unknown): boolean | null {
  switch (type) {
    case 'single_choice':
      return normalize(userAnswer) === normalize(answer);
    case 'multiple_choice': {
      const a = asKeyArray(answer);
      const u = asKeyArray(userAnswer);
      if (u.length === 0) return false;
      const sa = new Set(a.map(normalize));
      const su = new Set(u.map(normalize));
      if (sa.size === 0) return false;
      return sa.size === su.size && [...sa].every((k) => su.has(k));
    }
    case 'true_false':
      return Boolean(userAnswer) === Boolean(answer);
    case 'fill_blank': {
      const accepted = asKeyArray(answer);
      const u = normalize(userAnswer);
      if (!u) return false;
      return accepted.some((a) => normalize(a) === u);
    }
    case 'short_answer':
      return null;
    default:
      return null;
  }
}

/** 该题型是否为客观题（可自动判分） */
export function isObjective(type: string): boolean {
  return type !== 'short_answer';
}
