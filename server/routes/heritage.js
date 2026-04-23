import { Router } from "express";
import { query } from "../db.js";
import { authOptional, requireLogin, requireRole } from "../middleware/auth.js";
import { mapHeritageRowToApi } from "../lib/sanitize.js";
import { writeOperationLog } from "../lib/oplog.js";

const router = Router();

router.get("/", authOptional, async (req, res) => {
  const role = req.user.role;
  let sql = `SELECT * FROM heritage_sites`;
  const params = [];
  if (role === "visitor") {
    sql += ` WHERE is_published = true`;
  }
  sql += ` ORDER BY slug`;
  const { rows } = await query(sql, params);
  const list = rows.map((row) => mapHeritageRowToApi(row, role));
  res.json(list);
});

router.get("/:slug", authOptional, async (req, res) => {
  const role = req.user.role;
  const { slug } = req.params;
  let sql = `SELECT * FROM heritage_sites WHERE slug = $1`;
  const params = [slug];
  if (role === "visitor") {
    sql += ` AND is_published = true`;
  }
  const { rows } = await query(sql, params);
  if (!rows.length) return res.status(404).json({ error: "未找到或无权访问" });
  res.json(mapHeritageRowToApi(rows[0], role));
});

// 创建：仅 admin
router.post("/", authOptional, requireLogin, requireRole("admin"), async (req, res) => {
  const ip = req.ip || req.socket?.remoteAddress;
  const b = { ...(req.body ?? {}) };
  // 必填字段简单校验
  const required = ["name", "category", "era", "lon_public", "lat_public"];
  for (const f of required) {
    if (b[f] === undefined || b[f] === null || String(b[f]).trim() === "") {
      return res.status(400).json({ error: `缺少字段：${f}` });
    }
  }

  // 简单 slug 生成：小写、非字母数字替换为 -、去重
  const makeSlug = (s) =>
    String(s)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  let baseSlug = makeSlug(b.name);
  if (!baseSlug) baseSlug = `site-${Date.now()}`;
  let slug = baseSlug;
  let suffix = 1;
  // 保证 slug 唯一
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { rows } = await query(`SELECT 1 FROM heritage_sites WHERE slug = $1 LIMIT 1`, [slug]);
    if (!rows.length) break;
    slug = `${baseSlug}-${suffix++}`;
  }

  const cols = [
    "slug",
    "name",
    "category",
    "era",
    "address",
    "protection",
    "summary",
    "height",
    "lon_public",
    "lat_public",
    "lon_precise",
    "lat_precise",
    "internal_notes",
    "indicators",
    "is_published",
    "created_by",
    "updated_by",
  ];

  const vals = [];
  const parts = [];
  let i = 1;
  for (const c of cols) {
    parts.push(`$${i}`);
    if (c === "slug") vals.push(slug);
    else if (c === "indicators") vals.push(JSON.stringify(b.indicators ?? { history: 3, integrity: 3, reuse: 3 }));
    else if (c === "created_by" || c === "updated_by") vals.push(req.user.sub);
    else vals.push(b[c] ?? null);
    i++;
  }

  const sql = `INSERT INTO heritage_sites (${cols.join(", ")}) VALUES (${parts.join(", ")}) RETURNING *`;
  const r = await query(sql, vals);
  const row = r.rows[0];
  await writeOperationLog({
    userId: req.user.sub,
    actionType: "heritage_create",
    detail: { slug, fields: Object.keys(b) },
    ip,
  });
  res.status(201).json(mapHeritageRowToApi(row, req.user.role));
});

// 更新：仅 admin（按要求，管理员可增删查改）
router.put("/:slug", authOptional, requireLogin, requireRole("admin"), async (req, res) => {
  const ip = req.ip || req.socket?.remoteAddress;
  const { slug } = req.params;
  const b = { ...(req.body ?? {}) };
  if (req.user.role !== "admin") {
    delete b.internal_notes;
  }
  const allowed = [
    "name",
    "category",
    "era",
    "address",
    "protection",
    "summary",
    "height",
    "lon_public",
    "lat_public",
    "lon_precise",
    "lat_precise",
    "internal_notes",
    "indicators",
    "is_published",
  ];
  const parts = [];
  const vals = [];
  let i = 1;
  for (const key of allowed) {
    if (b[key] === undefined) continue;
    if (key === "indicators") {
      parts.push(`indicators = $${i}::jsonb`);
      vals.push(JSON.stringify(b[key]));
    } else {
      parts.push(`${key} = $${i}`);
      vals.push(b[key]);
    }
    i++;
  }
  if (!parts.length) {
    return res.status(400).json({ error: "无可更新字段" });
  }
  parts.push(`updated_at = now()`);
  parts.push(`updated_by = $${i}::uuid`);
  vals.push(req.user.sub);
  i++;
  vals.push(slug);
  const sql = `UPDATE heritage_sites SET ${parts.join(", ")} WHERE slug = $${i} RETURNING *`;
  const r = await query(sql, vals);
  if (!r.rows.length) return res.status(404).json({ error: "未找到" });
  await writeOperationLog({
    userId: req.user.sub,
    actionType: "heritage_update",
    detail: { slug, fields: Object.keys(b) },
    ip,
  });
  res.json(mapHeritageRowToApi(r.rows[0], req.user.role));
});

// 删除：仅 admin
router.delete("/:slug", authOptional, requireLogin, requireRole("admin"), async (req, res) => {
  const ip = req.ip || req.socket?.remoteAddress;
  const { slug } = req.params;
  // 先查询要删除的行用于返回/审计
  const { rows: pre } = await query(`SELECT * FROM heritage_sites WHERE slug = $1`, [slug]);
  if (!pre.length) return res.status(404).json({ error: "未找到" });
  await query(`DELETE FROM heritage_sites WHERE slug = $1`, [slug]);
  await writeOperationLog({
    userId: req.user.sub,
    actionType: "heritage_delete",
    detail: { slug },
    ip,
  });
  res.json({ ok: true });
});

export default router;
