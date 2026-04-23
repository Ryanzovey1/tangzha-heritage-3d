import { query } from "../db.js";

export async function writeOperationLog({ userId, actionType, detail, ip }) {
  await query(
    `INSERT INTO operation_log (user_id, action_type, detail, ip)
     VALUES ($1::uuid, $2, $3::jsonb, $4::inet)`,
    [userId || null, actionType, JSON.stringify(detail ?? {}), ip || null],
  );
}
