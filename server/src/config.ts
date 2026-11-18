import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server 目录（src 的上一级）
export const serverRoot = path.resolve(__dirname, '..');

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'insecure-default-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  dbFile: path.resolve(serverRoot, process.env.DB_FILE ?? './data/ops-training.db'),
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};
