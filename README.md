# 运维练习 + 面试 + 实验平台

独立 Web 应用（Node.js + Vue 3 全栈），首个迭代落地**运维练习题库 MVP**，并预留面试模拟与实验环境的扩展接口和数据模型。

## 技术栈

- 后端：Express 4 + TypeScript + `node:sqlite`（零原生依赖）+ JWT + bcryptjs + CORS，Zod 参数校验
- 前端：Vue 3 + Vite + TypeScript + Pinia + Vue Router + Element Plus + Axios
- 数据库：SQLite（单文件 `server/data/ops-training.db`），`PRAGMA foreign_keys = ON`，支持递归分类树（CTE）与软删除（`archived_at`）

## 项目结构

```
ops-training-platform/
├── pnpm-workspace.yaml      # pnpm workspace (server + web), allowBuilds
├── package.json             # root scripts
├── .gitignore
├── server/
│   ├── package.json
│   ├── src/
│   │   ├── index.ts         # 入口，监听 4000，触发迁移
│   │   ├── app.ts           # createApp，CORS/json/路由/错误处理
│   │   ├── config.ts        # 环境变量配置 (PORT/JWT_SECRET/DB_FILE/CORS_ORIGIN)
│   │   ├── schema.ts        # 全量 DDL (users/categories/tags/questions/attempts/interview/lab...)
│   │   ├── db.ts            # getDb/all/get/run + COLUMN_MIGRATIONS 软删除列迁移
│   │   ├── errors.ts        # AppError / notFound / errorHandler (UNIQUE→409)
│   │   ├── auth.ts          # bcryptjs 密码 / JWT 签发与校验
│   │   ├── middleware.ts    # requireAuth / requireAdmin / optionalAuth
│   │   ├── util.ts          # uid / now / parseJson / toJson / clampInt
│   │   ├── grading.ts       # gradeQuestion / isObjective (多选 Set 比对，简答返回 null)
│   │   ├── seed.ts          # 8 分类 / 4 标签 / 49 题，admin/demo 默认账号，幂等
│   │   ├── routes/
│   │   │   ├── auth.ts      # register/login/me(+stats)
│   │   │   ├── categories.ts# 树形分类 + question_count (只统计未归档)
│   │   │   ├── tags.ts      # 标签 CRUD
│   │   │   ├── questions.ts # 列表/详情/CRUD，引用则软删除
│   │   │   ├── practice.ts  # 创建/历史/详情/作答/交卷，排除归档题
│   │   │   └── stats.ts     # 概览/难度/类型/热门分类，排除归档题
│   │   └── (interview/labs 接口预留)
│   └── data/                # SQLite 数据库文件（运行时生成）
└── web/
    ├── package.json
    ├── src/
    │   ├── types.ts         # Question/Category/Tag/Attempt/OverviewStats 等
    │   ├── api/http.ts      # axios 拦截器 + 401 自动登出
    │   ├── api/index.ts     # 类型化 API 对象
    │   ├── stores/auth.ts   # Pinia 登录/会话/用户信息
    │   ├── router/index.ts  # 路由 + guest/admin 守卫
    │   ├── layouts/MainLayout.vue
    │   ├── views/           # Login/Register/Dashboard/QuestionBank/Practice/History/AdminQuestions/ComingSoon
    │   └── utils/format.ts  # 答案格式化
```

## 快速开始

### 前提

- Node.js ≥ 24（内置 `node:sqlite`）
- pnpm ≥ 11（已配置 `allowBuilds`）

### 安装依赖

```bash
pnpm install
```

### 启动后端（端口 4000）

```bash
pnpm --filter @ops/server exec tsx src/index.ts
```

服务启动后：
- API 健康检查：`http://localhost:4000/api/health`
- 数据库：`server/data/ops-training.db`
- 种子数据会自动写入（幂等，重复运行无副作用）

### 启动前端（端口 5173）

```bash
pnpm --filter @ops/web run dev
```

前端 Vite 已配置 `/api` 代理 → `http://localhost:4000`。

### 构建前端

```bash
pnpm --filter @ops/web run build
```

## 默认账号

| 账号 | 密码 | 角色 |
|------|------|------|
| admin | admin123 | ADMIN |
| demo | demo123 | USER |

## 主要功能（MVP）

1. **用户认证**：注册、登录、获取当前用户（含个人统计）
2. **题库管理**：分类树（递归 CTE）、标签、题目增删改查、筛选（分类/难度/类型/标签/关键词）
3. **软删除**：被 `attempt_items` 引用的题目不能物理删除，改为 `archived_at` 归档，从题库和练习中隐藏；未引用的直接物理删除
4. **练习与判分**：随机或指定题目创建练习，单选/多选/判断/填空自动评分，简答返回 null（待人工审核）；练习模式即时反馈，考试模式交卷后揭晓答案
5. **统计**：个人概览 + 平台概览 + 难度/类型分布 + 热门分类（均排除归档题）
6. **扩展预留**：`interview_sessions`、`lab_tasks`、`lab_attempts` 数据模型已在 `schema.ts` 中预留，对应 `/interview`、`/labs` 前端页面为 Coming Soon

## 环境变量（`.env`，示例）

```
PORT=4000
JWT_SECRET=change-me-in-production
DB_FILE=./data/ops-training.db
CORS_ORIGIN=http://localhost:5173
```

## 后续计划

- 面试模拟模块（`interview_sessions`）
- 实验环境模块（`lab_tasks` / `lab_attempts`）
- 管理员后台完善（用户管理、题目审核、导出报表）
