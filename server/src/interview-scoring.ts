/**
 * 面试主观题评分（无外部 LLM 依赖的启发式方案）。
 *
 * 思路：
 * 1. 从「参考答案 + 解析」中抽取候选关键词（按中英文标点/空白切分，保留长度 >= 2 的片段）
 * 2. 统计候选关键词在用户回答中的命中情况（子串匹配）
 * 3. 结合「命中率」与「回答充实度」给出 0-100 分，并给出命中/遗漏要点作为反馈
 *
 * 该方案优点是零依赖、可解释、离线可用；后续接入 LLM 时只需替换 gradeInterviewAnswer。
 */

export interface InterviewGradeResult {
  score: number;
  hits: string[];
  missed: string[];
  comment: string;
}

/** 无意义的高频虚词，避免被当成得分点 */
const STOP_WORDS = new Set([
  '可以', '需要', '然后', '如果', '因为', '所以', '但是', '并且', '以及', '或者',
  '这个', '那个', '一个', '我们', '他们', '进行', '通过', '对于', '由于', '其中',
  '如下', '例如', '比如', '同时', '一般', '通常', '主要', '相关', '情况', '问题',
  '常见', '注意', '使用', '查看', '检查', '确认', '确保', '包括', '支持', '提供',
]);

/** 把一段文本切成候选关键词 */
function tokenize(text: string): string[] {
  const raw = String(text ?? '')
    .split(/[\s，。；：、！？,.;:!?()（）\[\]【】"'“”‘’/\\|<>《》=+*&#@$%^~`]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const token of raw) {
    if (STOP_WORDS.has(token)) continue;
    // 过长的句子片段（>16 字）进一步按逗号已切过，这里截断成短要点
    const candidate = token.length > 16 ? token.slice(0, 16) : token;
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    out.push(candidate);
  }
  return out;
}

/** 从参考答案中提取「期望出现的要点」 */
export function extractKeyPoints(reference: string, explanation?: string | null, limit = 10): string[] {
  const merged = [reference, explanation].filter(Boolean).join('。');
  const tokens = tokenize(merged);
  // 优先保留较长的片段（信息量更大）
  return tokens.sort((a, b) => b.length - a.length).slice(0, limit);
}

function normalizeForMatch(s: string): string {
  return String(s ?? '').toLowerCase().replace(/\s+/g, '');
}

/**
 * 给一道面试主观题打分。
 * @param referenceAnswer 参考答案
 * @param explanation 解析（可选，参与要点提取）
 * @param userAnswer 用户回答
 */
export function gradeInterviewAnswer(
  referenceAnswer: string,
  explanation: string | null | undefined,
  userAnswer: string,
): InterviewGradeResult {
  const user = normalizeForMatch(userAnswer);
  const answerLen = user.length;

  // 未作答
  if (answerLen === 0) {
    return { score: 0, hits: [], missed: [], comment: '未作答。' };
  }

  const keyPoints = extractKeyPoints(referenceAnswer, explanation);
  if (keyPoints.length === 0) {
    // 没有可对照的要点，仅按充实度给分
    const score = Math.min(100, Math.round((answerLen / 60) * 100));
    return { score, hits: [], missed: [], comment: '该题暂无标准要点，按回答充实度评分。' };
  }

  const hits: string[] = [];
  const missed: string[] = [];
  for (const kp of keyPoints) {
    if (user.includes(normalizeForMatch(kp))) hits.push(kp);
    else missed.push(kp);
  }

  const hitRate = hits.length / keyPoints.length;
  // 命中率占 80 分，回答充实度占 20 分（以 120 字为满分基准）
  const coverageScore = hitRate * 80;
  const richnessScore = Math.min(20, (answerLen / 120) * 20);
  const score = Math.max(0, Math.min(100, Math.round(coverageScore + richnessScore)));

  let comment: string;
  if (score >= 85) comment = '回答完整，覆盖了绝大多数关键要点，表达清晰。';
  else if (score >= 70) comment = '回答较好，主要要点基本覆盖，可再补充细节。';
  else if (score >= 50) comment = '回答部分正确，遗漏了一些关键要点，建议对照参考答案完善。';
  else comment = '回答与要点差距较大，建议先梳理标准答案中的核心概念再作答。';

  return { score, hits, missed, comment };
}

/** 汇总整场面试成绩 */
export function summarizeInterview(items: { score: number }[]): { score: number; level: string; advice: string } {
  if (items.length === 0) {
    return { score: 0, level: '未完成', advice: '本场面试没有作答记录。' };
  }
  const avg = Math.round(items.reduce((s, i) => s + i.score, 0) / items.length);
  let level: string;
  let advice: string;
  if (avg >= 85) {
    level = '优秀';
    advice = '整体表现优秀，知识点覆盖全面，可进一步打磨表达的结构化（先说结论再展开）。';
  } else if (avg >= 70) {
    level = '良好';
    advice = '整体表现良好，建议针对遗漏的要点做专项复习，并在回答中补充生产实践案例。';
  } else if (avg >= 50) {
    level = '及格';
    advice = '基础概念已掌握一部分，建议按「命中/遗漏要点」逐条补齐，并配合题库练习巩固。';
  } else {
    level = '待提升';
    advice = '当前与面试要求还有差距，建议先系统复习对应分类的题库，再进行下一轮模拟。';
  }
  return { score: avg, level, advice };
}
