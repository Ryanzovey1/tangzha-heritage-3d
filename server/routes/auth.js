import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { query } from "../db.js";
import { authOptional, requireLogin } from "../middleware/auth.js";
import { writeOperationLog } from "../lib/oplog.js";

const router = Router();

router.post("/login", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    return res.status(400).json({ error: "缺少用户名或密码" });
  }
  const ip = req.ip || req.socket?.remoteAddress;
  const r = await query(
    `SELECT u.id, u.username, u.password_hash, r.code AS role
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.username = $1 AND u.is_active`,
    [username],
  );
  if (r.rows.length === 0) {
    await writeOperationLog({
      userId: null,
      actionType: "login_failed",
      detail: { username },
      ip,
    });
    return res.status(401).json({ error: "用户名或密码错误" });
  }
  const row = r.rows[0];
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) {
    await writeOperationLog({
      userId: null,
      actionType: "login_failed",
      detail: { username },
      ip,
    });
    return res.status(401).json({ error: "用户名或密码错误" });
  }
  await query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [row.id]);
  const token = jwt.sign(
    { sub: row.id, role: row.role, username: row.username },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "8h" },
  );
  await writeOperationLog({
    userId: row.id,
    actionType: "login_success",
    detail: { username: row.username, role: row.role },
    ip,
  });
  res.json({ access_token: token, role: row.role, username: row.username });
});

router.get("/me", authOptional, requireLogin, async (req, res) => {
  const r = await query(
    `SELECT u.id, u.username, r.code AS role
     FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
    [req.user.sub],
  );
  if (!r.rows.length) return res.status(404).json({ error: "用户不存在" });
  res.json(r.rows[0]);
});

export default router;
