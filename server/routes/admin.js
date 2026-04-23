import { Router } from "express";
import { query } from "../db.js";
import { authOptional, requireLogin, requireRole } from "../middleware/auth.js";

const router = Router();

router.use(authOptional, requireLogin, requireRole("admin"));

router.get("/audit", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const { rows } = await query(
    `SELECT a.id, a.heritage_id, a.action, a.old_row, a.new_row, a.actor_id, a.created_at,
            u.username AS actor_username,
            h.slug AS heritage_slug
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.actor_id
     LEFT JOIN heritage_sites h ON h.id = a.heritage_id
     ORDER BY a.created_at DESC
     LIMIT $1`,
    [limit],
  );
  res.json(rows);
});

router.get("/operations", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const { rows } = await query(
    `SELECT o.id, o.user_id, o.action_type, o.detail, o.ip, o.created_at, u.username
     FROM operation_log o
     LEFT JOIN users u ON u.id = o.user_id
     ORDER BY o.created_at DESC
     LIMIT $1`,
    [limit],
  );
  res.json(rows);
});

export default router;
