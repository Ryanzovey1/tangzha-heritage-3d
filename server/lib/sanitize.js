/**
 * 按角色对遗存行做列级脱敏后输出给前端（与 Cesium 使用的字段对齐）
 * visitor：仅已发布记录；仅公开坐标；无内部备注、无精确坐标字段
 * editor：可见未发布；精确坐标优先；无内部备注
 * admin：全字段
 */
export function mapHeritageRowToApi(row, role) {
  const usePrecise = role === "editor" || role === "admin";
  const lon = usePrecise && row.lon_precise != null ? Number(row.lon_precise) : Number(row.lon_public);
  const lat = usePrecise && row.lat_precise != null ? Number(row.lat_precise) : Number(row.lat_public);

  const base = {
    id: row.slug,
    name: row.name,
    category: row.category,
    era: row.era,
    address: row.address ?? "",
    protection: row.protection ?? "",
    summary: row.summary ?? "",
    height: row.height != null ? Number(row.height) : 0,
    lon,
    lat,
    indicators: typeof row.indicators === "string" ? JSON.parse(row.indicators) : row.indicators,
  };

  if (role === "admin") {
    return {
      ...base,
      lon_public: Number(row.lon_public),
      lat_public: Number(row.lat_public),
      lon_precise: row.lon_precise != null ? Number(row.lon_precise) : null,
      lat_precise: row.lat_precise != null ? Number(row.lat_precise) : null,
      internal_notes: row.internal_notes ?? "",
      is_published: row.is_published,
    };
  }

  if (role === "editor") {
    return {
      ...base,
      lon_public: Number(row.lon_public),
      lat_public: Number(row.lat_public),
      lon_precise: row.lon_precise != null ? Number(row.lon_precise) : null,
      lat_precise: row.lat_precise != null ? Number(row.lat_precise) : null,
      is_published: row.is_published,
    };
  }

  return base;
}
