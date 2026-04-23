-- 唐闸工业遗存系统：用户、角色、遗存主表、操作日志、数据审计
-- PostgreSQL 14+ 建议；需启用 pgcrypto（gen_random_uuid）

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------- 角色（访客不建账号，由接口匿名角色处理）----------
CREATE TABLE roles (
    id          SMALLSERIAL PRIMARY KEY,
    code        TEXT NOT NULL UNIQUE,
    name_zh     TEXT NOT NULL
);

INSERT INTO roles (code, name_zh) VALUES
    ('visitor', '访客（匿名）'),
    ('editor',  '录入员'),
    ('admin',   '管理员')
ON CONFLICT (code) DO NOTHING;

-- ---------- 用户 ----------
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username        TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    role_id         SMALLINT NOT NULL REFERENCES roles (id),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at   TIMESTAMPTZ
);

CREATE INDEX idx_users_role ON users (role_id);

-- ---------- 遗存主数据（列级敏感：精确坐标、内部备注）----------
CREATE TABLE heritage_sites (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    category        TEXT NOT NULL,
    era             TEXT NOT NULL,
    address         TEXT,
    protection      TEXT,
    summary         TEXT,
    height          REAL NOT NULL DEFAULT 0,
    -- 对外展示坐标（访客仅见）
    lon_public      DOUBLE PRECISION NOT NULL,
    lat_public      DOUBLE PRECISION NOT NULL,
    -- 内部测绘坐标（录入员/管理员）
    lon_precise     DOUBLE PRECISION,
    lat_precise     DOUBLE PRECISION,
    internal_notes  TEXT,
    indicators      JSONB NOT NULL DEFAULT '{"history":3,"integrity":3,"reuse":3}'::jsonb,
    -- 行级：未发布则访客不可见整条记录
    is_published    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID REFERENCES users (id),
    updated_by      UUID REFERENCES users (id)
);

CREATE INDEX idx_heritage_published ON heritage_sites (is_published);
CREATE INDEX idx_heritage_slug ON heritage_sites (slug);

-- ---------- 数据变更审计（谁在何时改了哪条遗存）----------
CREATE TABLE audit_log (
    id              BIGSERIAL PRIMARY KEY,
    heritage_id   UUID REFERENCES heritage_sites (id) ON DELETE SET NULL,
    action          TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_row         JSONB,
    new_row         JSONB,
    actor_id        UUID REFERENCES users (id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_heritage ON audit_log (heritage_id);
CREATE INDEX idx_audit_actor ON audit_log (actor_id);
CREATE INDEX idx_audit_time ON audit_log (created_at DESC);

-- ---------- 操作日志（登录、管理查询等）----------
CREATE TABLE operation_log (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID REFERENCES users (id),
    action_type     TEXT NOT NULL,
    detail          JSONB,
    ip              INET,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_oplog_user ON operation_log (user_id);
CREATE INDEX idx_oplog_time ON operation_log (created_at DESC);

-- ---------- 交通 POI 表 ----------
CREATE TABLE IF NOT EXISTS transport_pois (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transport_pois_type ON transport_pois (type);
CREATE INDEX IF NOT EXISTS idx_transport_pois_location ON transport_pois (lon, lat);

-- ---------- 触发器：遗存表变更自动写 audit_log ----------
CREATE OR REPLACE FUNCTION trg_heritage_sites_audit()
RETURNS TRIGGER AS $$
DECLARE
    v_actor UUID;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_actor := NEW.created_by;
        INSERT INTO audit_log (heritage_id, action, old_row, new_row, actor_id)
        VALUES (NEW.id, 'INSERT', NULL, to_jsonb(NEW), v_actor);
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        v_actor := NEW.updated_by;
        INSERT INTO audit_log (heritage_id, action, old_row, new_row, actor_id)
        VALUES (NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), v_actor);
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        v_actor := OLD.updated_by;
        INSERT INTO audit_log (heritage_id, action, old_row, new_row, actor_id)
        VALUES (OLD.id, 'DELETE', to_jsonb(OLD), NULL, v_actor);
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS heritage_sites_audit ON heritage_sites;
CREATE TRIGGER heritage_sites_audit
    AFTER INSERT OR UPDATE OR DELETE ON heritage_sites
    FOR EACH ROW
    EXECUTE PROCEDURE trg_heritage_sites_audit();

COMMENT ON TABLE heritage_sites IS '工业遗存主数据；访客仅见 is_published 与公开坐标';
COMMENT ON COLUMN heritage_sites.lon_precise IS '敏感：仅 editor/admin API 返回';
COMMENT ON COLUMN heritage_sites.internal_notes IS '敏感：仅 admin API 返回（可按需改为 editor）';
