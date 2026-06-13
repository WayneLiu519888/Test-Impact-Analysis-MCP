/**
 * 共享路径工具 — 统一项目根目录定位，消除跨文件 __dirname 重复计算
 */

import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ESM __dirname 等价物 — 全项目唯一一处
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** 项目根目录（src/ 的父目录） */
export const PROJECT_ROOT = join(__dirname, "..");
