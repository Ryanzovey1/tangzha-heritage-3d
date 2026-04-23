/**
 * 始终从 server 目录加载 .env（避免从项目根执行 npm run seed 时读到根目录 .env）
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, ".env");
const result = dotenv.config({ path: envPath });
if (result.error && process.env.NODE_ENV !== "test") {
  console.warn(`[env] 未读取到 ${envPath}：${result.error.message}（将仅使用已存在的环境变量）`);
}
