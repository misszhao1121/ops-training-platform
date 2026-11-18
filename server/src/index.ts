import { createApp } from './app.js';
import { config } from './config.js';
import { getDb } from './db.js';

// 触发建表
getDb();

const app = createApp();
app.listen(config.port, () => {
  console.log(`[ops-server] 已启动: http://localhost:${config.port}`);
  console.log(`[ops-server] 健康检查: http://localhost:${config.port}/api/health`);
  console.log(`[ops-server] 数据库: ${config.dbFile}`);
});
