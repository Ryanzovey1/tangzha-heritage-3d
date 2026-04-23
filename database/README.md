# PostgreSQL 使用说明

## 1. 建库

```sql
CREATE DATABASE tangzha_heritage ENCODING 'UTF8';
```

## 2. 执行结构脚本

```bash
psql -U postgres -d tangzha_heritage -f database/schema.sql
```

若触发器语法报错，请将 `EXECUTE PROCEDURE` 改为当前 PostgreSQL 版本文档推荐的 `EXECUTE FUNCTION`（部分新版本）。

## 3. 写入示例账号与遗存数据

在 **`server` 目录**（不是项目根目录）创建 **`.env`**：复制 `server/.env.example` 为 `server/.env`，并填写 `DATABASE_URL`、`JWT_SECRET`。根目录的 `.env` 只给 Vite 用，**数据库连接必须写在 `server/.env`**，否则从根目录执行 `npm run seed` 会读不到密码并报错。

安装依赖并灌库。

**方式 A：在项目根目录执行（推荐）**

```bash
npm install --prefix server
npm run seed
```

**方式 B：先进入 `server` 目录**

```bash
cd server
npm install
npm run seed
```

> 若在根目录执行 `npm run seed` 仍报错，请先执行一次 `npm install --prefix server`，确保 `server/node_modules` 存在。

默认账号：`admin1`、`editor1`，密码均为 `password123`（仅开发环境，生产环境请修改）。

## 4. 启动 API

**方式 A：根目录**

```bash
npm run server
```

或（等价）

```bash
npm run start:api
```

**方式 B：`server` 目录**

```bash
cd server
npm start
```

根目录 **没有** 单独的 `npm run start` 指向 API（避免与常见习惯混淆）；前端请用 `npm run dev`。

前端开发时 Vite 已将 `/api` 代理到 `http://localhost:3001`。

## 5. 主要表说明

| 表 | 用途 |
|----|------|
| `roles` | visitor / editor / admin |
| `users` | 登录账号与密码哈希 |
| `heritage_sites` | 遗存主数据；精确坐标与内部备注为敏感列 |
| `audit_log` | 遗存表变更审计（触发器自动写入） |
| `operation_log` | 登录等操作日志 |
