import http from './http';
import type {
  Attempt,
  AttemptItem,
  Category,
  CheckinData,
  ImportedQuestion,
  InterviewAnswerResult,
  InterviewSession,
  InterviewTopic,
  LeaderboardEntry,
  OverviewStats,
  Pagination,
  Question,
  Tag,
  User,
  WrongBookItem,
} from '@/types';

export interface ListResult<T> {
  data: T[];
  pagination: Pagination;
}

export interface AuthResult {
  token: string;
  user: User;
}

export const api = {
  // 认证
  register: (payload: { email: string; username: string; password: string }) =>
    http.post('/auth/register', payload) as Promise<AuthResult>,
  login: (payload: { account: string; password: string }) =>
    http.post('/auth/login', payload) as Promise<AuthResult>,
  me: () =>
    http.get('/auth/me') as Promise<{
      user: User;
      stats: { attemptCount: number; completedCount: number; correctCount: number; totalCount: number };
    }>,

  // 分类 / 标签
  categories: () => http.get('/categories') as Promise<{ data: Category[] }>,
  createCategory: (payload: Record<string, unknown>) => http.post('/categories', payload),
  tags: () => http.get('/tags') as Promise<{ data: Tag[] }>,
  createTag: (payload: { name: string }) => http.post('/tags', payload),

  // 题目
  questions: (params: Record<string, unknown>) =>
    http.get('/questions', { params }) as Promise<ListResult<Question>>,
  question: (id: string) => http.get(`/questions/${id}`) as Promise<{ data: Question }>,
  createQuestion: (payload: Record<string, unknown>) =>
    http.post('/questions', payload) as Promise<{ data: Question }>,
  updateQuestion: (id: string, payload: Record<string, unknown>) =>
    http.put(`/questions/${id}`, payload) as Promise<{ data: Question }>,
  deleteQuestion: (id: string) => http.delete(`/questions/${id}`) as Promise<{ success: boolean }>,

  // 题库导入
  importParseFile: (payload: { filename: string; contentBase64: string }) =>
    http.post('/questions/import/parse', payload, { timeout: 60000 }) as Promise<{
      data: ImportedQuestion[];
      errors: string[];
    }>,
  importQuestions: (payload: { industryId?: string; questions: Record<string, unknown>[] }) =>
    http.post('/questions/import', payload, { timeout: 60000 }) as Promise<{
      success: boolean;
      imported: number;
      skipped: string[];
      total: number;
    }>,

  // 学习激励：错题本 / 打卡 / 排行榜
  wrongBook: (params: Record<string, unknown>) =>
    http.get('/learning/wrong-book', { params }) as Promise<ListResult<WrongBookItem>>,
  wrongBookCount: () =>
    http.get('/learning/wrong-book/count') as Promise<{ data: { pending: number } }>,
  removeWrong: (questionId: string) =>
    http.delete(`/learning/wrong-book/${questionId}`) as Promise<{ success: boolean }>,
  repractice: (payload: { count?: number; mode?: 'practice' | 'exam' }) =>
    http.post('/learning/wrong-book/repractice', payload) as Promise<{
      data: { id: string; total: number };
    }>,
  checkin: () => http.get('/learning/checkin') as Promise<{ data: CheckinData }>,
  leaderboard: (range: string) =>
    http.get('/learning/leaderboard', { params: { range } }) as Promise<{
      data: { range: string; entries: LeaderboardEntry[]; me: LeaderboardEntry | null };
    }>,

  // 收藏
  toggleFavorite: (questionId: string) =>
    http.post(`/questions/${questionId}/favorite`) as Promise<{ favorited: boolean }>,
  favoriteQuestions: (params: Record<string, unknown>) =>
    http.get('/questions/favorites', { params }) as Promise<ListResult<Question>>,

  // 练习
  practiceAvailable: (params: Record<string, unknown>) =>
    http.get('/practice/available', { params }) as Promise<{ data: { available: number } }>,
  nextAttemptQuestion: (id: string, payload: { difficulty?: string }) =>
    http.post(`/practice/attempts/${id}/next`, payload) as Promise<{ data: AttemptItem }>,
  knowledgePoints: () =>
    http.get('/questions/knowledge-points') as Promise<{ data: { name: string; count: number }[] }>,

  // 面试模拟
  interviewTopics: () =>
    http.get('/interview/topics') as Promise<{ data: InterviewTopic[] }>,
  createInterview: (payload: Record<string, unknown>) =>
    http.post('/interview/sessions', payload) as Promise<{ data: InterviewSession }>,
  interviewSessions: (params: Record<string, unknown>) =>
    http.get('/interview/sessions', { params }) as Promise<ListResult<InterviewSession>>,
  interviewSession: (id: string) =>
    http.get(`/interview/sessions/${id}`) as Promise<{ data: InterviewSession }>,
  answerInterview: (id: string, payload: { questionId: string; answer: string }) =>
    http.post(`/interview/sessions/${id}/answer`, payload) as Promise<{ data: InterviewAnswerResult }>,
  finishInterview: (id: string) =>
    http.post(`/interview/sessions/${id}/finish`) as Promise<{ data: InterviewSession }>,
  deleteInterview: (id: string) =>
    http.delete(`/interview/sessions/${id}`) as Promise<{ success: boolean }>,

  // 个人中心
  changePassword: (payload: { oldPassword: string; newPassword: string }) =>
    http.post('/auth/password', payload) as Promise<{ success: boolean }>,
  createAttempt: (payload: Record<string, unknown>) =>
    http.post('/practice/attempts', payload) as Promise<{ data: Attempt }>,
  attempts: (params: Record<string, unknown>) =>
    http.get('/practice/attempts', { params }) as Promise<ListResult<Attempt>>,
  attempt: (id: string) => http.get(`/practice/attempts/${id}`) as Promise<{ data: Attempt }>,
  answerAttempt: (id: string, payload: { questionId: string; answer: unknown }) =>
    http.post(`/practice/attempts/${id}/answer`, payload) as Promise<{
      data: { recorded: boolean; isCorrect?: boolean | null; explanation?: string | null };
    }>,
  submitAttempt: (id: string) =>
    http.post(`/practice/attempts/${id}/submit`) as Promise<{ data: Attempt }>,

  // 统计
  stats: () => http.get('/stats/overview') as Promise<{ data: OverviewStats }>,
};
