export type QuestionType = 'single_choice' | 'multiple_choice' | 'true_false' | 'fill_blank' | 'short_answer';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type Role = 'USER' | 'ADMIN';
export type AttemptMode = 'practice' | 'exam' | 'adaptive';

export interface User {
  id: string;
  email: string;
  username: string;
  role: Role;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  questionCount?: number;
  children?: Category[];
}

export interface Tag {
  id: string;
  name: string;
  questionCount?: number;
}

export interface QuestionOption {
  key: string;
  text: string;
}

export interface Question {
  id: string;
  title: string;
  type: QuestionType;
  difficulty: Difficulty;
  categoryId: string | null;
  categoryName: string | null;
  knowledgePoint: string | null;
  source: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  tags: Tag[];
  options?: QuestionOption[];
  answer?: unknown;
  explanation?: string | null;
  favorited?: boolean;
}

/** 错题本条目 */
export interface WrongBookItem {
  question: Question;
  wrongCount: number;
  lastWrongAt: string;
  resolved: boolean;
}

/** 每日打卡数据 */
export interface CheckinData {
  streakDays: number;
  totalDays: number;
  todayDone: boolean;
  today: string;
  recent: { date: string; count: number }[];
}

/** 排行榜条目 */
export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  completed: number;
  answered: number;
  correct: number;
  accuracy: number | null;
}

// ===== 面试模拟 =====
export interface InterviewTopic {
  id: string;
  name: string;
  questionCount: number;
}

export interface InterviewAnswerRecord {
  content: string;
  score: number;
  hits: string[];
  missed: string[];
  comment: string;
  answeredAt: string;
}

export interface InterviewQuestion {
  id: string;
  title: string;
  type: QuestionType;
  difficulty: Difficulty;
  categoryId: string | null;
  categoryName: string | null;
  knowledgePoint: string | null;
  referenceAnswer?: string;
  explanation?: string | null;
  answer: InterviewAnswerRecord | null;
}

export interface InterviewFeedback {
  level: string;
  advice: string;
  score: number;
  answeredCount: number;
  totalCount: number;
  categoryScores: { name: string; count: number; avgScore: number }[];
  weakest: { name: string; count: number; avgScore: number }[];
  details: {
    questionId: string;
    title: string;
    score: number;
    hits: string[];
    missed: string[];
    comment: string;
  }[];
}

export interface InterviewSession {
  id: string;
  topic: string | null;
  status: 'in_progress' | 'completed';
  score: number | null;
  feedback: InterviewFeedback | null;
  createdAt: string;
  endedAt: string | null;
  total: number;
  answeredCount: number;
  questions: InterviewQuestion[];
}

export interface InterviewAnswerResult {
  questionId: string;
  score: number;
  hits: string[];
  missed: string[];
  comment: string;
  referenceAnswer: string;
  explanation: string | null;
}

/** 题库导入：解析后的题目（valid=false 表示有问题，不参与导入） */
export interface ImportedQuestion {
  title: string;
  type: QuestionType;
  difficulty: Difficulty;
  options: QuestionOption[];
  answer: unknown;
  explanation: string;
  knowledgePoint: string;
  categoryName: string;
  tags: string[];
  source: string;
  valid: boolean;
  problem?: string;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AttemptItem {
  id: string;
  position: number;
  question: Question;
  userAnswer: unknown;
  isCorrect: boolean | null;
  answeredAt: string | null;
}

export interface Attempt {
  id: string;
  mode: AttemptMode;
  title: string;
  status: 'in_progress' | 'completed';
  total: number;
  correct: number | null;
  score: number | null;
  startedAt: string;
  endedAt: string | null;
  items?: AttemptItem[];
  objectiveCount?: number;
}

export interface OverviewStats {
  personal: {
    attemptCount: number;
    completedCount: number;
    avgScore: number | null;
    correctCount: number;
    totalCount: number;
    accuracy: number | null;
  };
  platform: {
    questionCount: number;
    categoryCount: number;
    tagCount: number;
    userCount: number;
  };
  byDifficulty: { difficulty: string; n: number }[];
  byType: { type: string; n: number }[];
  topCategories: { name: string; n: number }[];
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
};

export const TYPE_LABEL: Record<QuestionType, string> = {
  single_choice: '单选题',
  multiple_choice: '多选题',
  true_false: '判断题',
  fill_blank: '填空题',
  short_answer: '简答题',
};
