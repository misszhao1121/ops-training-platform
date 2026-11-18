import type { Question } from '@/types';

/** 把标准答案格式化为可读文本 */
export function formatAnswer(q: Question): string {
  const ans = q.answer;
  const opts = q.options ?? [];
  const textOf = (key: string) => opts.find((o) => o.key === key)?.text ?? key;

  switch (q.type) {
    case 'single_choice':
      return `${ans} · ${textOf(String(ans))}`;
    case 'multiple_choice': {
      const keys = Array.isArray(ans) ? ans.map(String) : [];
      return keys.map((k) => `${k} · ${textOf(k)}`).join('；');
    }
    case 'true_false':
      return ans === true || ans === 'true' ? '正确' : '错误';
    case 'fill_blank': {
      const arr = Array.isArray(ans) ? ans : [ans];
      return arr.map(String).join(' / ');
    }
    case 'short_answer':
      return String(ans ?? '（参考答案见解析）');
    default:
      return String(ans ?? '');
  }
}

/** 格式化用户答案 */
export function formatUserAnswer(q: Question, userAnswer: unknown): string {
  if (userAnswer == null || userAnswer === '') return '未作答';
  if (q.type === 'multiple_choice') {
    const keys = Array.isArray(userAnswer)
      ? userAnswer.map(String)
      : String(userAnswer).split(/[,\s]+/).filter(Boolean);
    const opts = q.options ?? [];
    const textOf = (key: string) => opts.find((o) => o.key === key)?.text ?? key;
    return keys.map((k) => `${k} · ${textOf(k)}`).join('；');
  }
  if (q.type === 'true_false') {
    return userAnswer === true || userAnswer === 'true' ? '正确' : '错误';
  }
  return String(userAnswer);
}
