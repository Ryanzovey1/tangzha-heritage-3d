/**
 * 初始化角色（若未执行 schema 中的 INSERT）、管理员/录入员账号、遗存数据。
 * 用法：项目根目录 `npm run seed` 或 server 目录 `npm run seed`
 * 依赖：已创建库并执行 database/schema.sql；必须存在 server/.env 且含 DATABASE_URL
 */
import "./load-env.js";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import bcrypt from "bcryptjs";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { Pool } = pg;

if (!process.env.DATABASE_URL || typeof process.env.DATABASE_URL !== "string") {
  console.error(
    "[seed] 缺少 DATABASE_URL。\n" +
      "请在 server 目录复制 .env.example 为 .env，并填写 PostgreSQL 连接串，例如：\n" +
      "  DATABASE_URL=postgresql://postgres:你的密码@localhost:5432/tangzha_heritage\n" +
      "（从项目根执行 npm run seed 时，环境变量必须写在 server/.env，不是根目录 .env）",
  );
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const sitesUrl = pathToFileURL(path.join(__dirname, "../src/data/sites.js")).href;
  const sitesMod = await import(sitesUrl);
  const { heritageSites } = sitesMod;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO roles (code, name_zh) VALUES
        ('visitor', '访客（匿名）'),
        ('editor', '录入员'),
        ('admin', '管理员')
      ON CONFLICT (code) DO NOTHING`,
    );

    const hash = bcrypt.hashSync("password123", 10);
    const adminIns = await client.query(
      `INSERT INTO users (username, password_hash, role_id)
       SELECT 'admin1', $1::text, id FROM roles WHERE code = 'admin'
       ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash
       RETURNING id`,
      [hash],
    );
    const editorIns = await client.query(
      `INSERT INTO users (username, password_hash, role_id)
       SELECT 'editor1', $1::text, id FROM roles WHERE code = 'editor'
       ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash
       RETURNING id`,
      [hash],
    );
    const adminId = adminIns.rows[0].id;
    const editorId = editorIns.rows[0].id;

    await client.query(`DELETE FROM heritage_sites`);

    for (const s of heritageSites) {
      const lonP = s.lon;
      const latP = s.lat;
      const lonPr = lonP + 0.00012;
      const latPr = latP + 0.00008;
      const internal = `【内部】${s.name}：测绘批次示意；不对外展示。`;
      const published = s.id !== "zisheng-iron";

      await client.query(
        `INSERT INTO heritage_sites (
          slug, name, category, era, address, protection, summary, height,
          lon_public, lat_public, lon_precise, lat_precise, internal_notes,
          indicators, is_published, created_by, updated_by
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,
          $9,$10,$11,$12,$13,
          $14::jsonb, $15, $16::uuid, $16::uuid
        )`,
        [
          s.id,
          s.name,
          s.category,
          s.era,
          s.address ?? "",
          s.protection ?? "",
          s.summary ?? "",
          s.height ?? 0,
          lonP,
          latP,
          lonPr,
          latPr,
          internal,
          JSON.stringify(s.indicators ?? { history: 3, integrity: 3, reuse: 3 }),
          published,
          adminId,
        ],
      );
    }

    // 插入示例交通 POI（覆盖已有的）
    await client.query(`DELETE FROM transport_pois`);
    const pois = [
      ['bus-1','唐闸公交站 A','公交站',120.8560,32.0490,'主要区内线路停靠点'],
      ['bus-2','唐闸公交站 B','公交站',120.8545,32.0486,'靠近运河码头，便于换乘'],
      ['ferry-1','运河渡口','渡口',120.8579,32.0480,'内河轮渡停靠点'],
      ['rail-1','南通站（示意）','火车站',120.8710,32.0600,'城际铁路车站，供远距离通达参考'],
      ['park-1','唐闸停车场','停车场',120.8556,32.0492,'周边短时停车位置'],
      ['bus-3','唐闸公交站 C','公交站',120.8528,32.0478,'临近商业区'],
      ['bus-4','唐闸公交站 D','公交站',120.8590,32.0496,'工业区东侧停靠'],
      ['ferry-2','内河码头 B','渡口',120.8588,32.0472,'货客混合通航点'],
      ['rail-2','通州南站（示意）','火车站',120.8800,32.0500,'示意用车站点'],
      ['park-2','中心停车楼','停车场',120.8535,32.0505,'长时停车位'],
      ['metro-1','地铁换乘（示意）','地铁站',120.8620,32.0510,'换乘节点（示意）'],
      ['bus-5','公交站 E','公交站',120.8568,32.0505,'临近遗存群'],
      ['bus-6','公交站 F','公交站',120.8515,32.0468,'社区线路停靠'],
      ['park-3','路侧停车','停车场',120.8570,32.0465,'路侧短时停车'],
      ['ferry-3','小渡口','渡口',120.8601,32.0499,'小型渡口']
    ];
    for (const p of pois) {
      await client.query(`INSERT INTO transport_pois (id,name,type,lon,lat,description) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, type=EXCLUDED.type, lon=EXCLUDED.lon, lat=EXCLUDED.lat, description=EXCLUDED.description`, p);
    }

    await client.query("COMMIT");
    console.log("Seed OK. 登录账号：admin1 / editor1，密码：password123");
    console.log("提示：资生铁冶厂 slug=zisheng-iron 设为未发布，访客 API 将不返回该条。");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
