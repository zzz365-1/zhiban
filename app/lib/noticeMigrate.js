// app/lib/noticeMigrate.js
// 老通知迁移：把没有事项字段的旧通知补出 items，其余字段一律原样保留。

import { buildItems } from "./noticeItems.js";

const CURRENT_SCHEMA_VERSION = 2;

// 是否需要迁移：有 items 字段视为新结构；schemaVersion >= 2 也视为新结构。
function needsMigrate(n) {
  if (!n || typeof n !== "object") return false;
  if (Object.prototype.hasOwnProperty.call(n, "items")) return false;
  if (
    typeof n.schemaVersion === "number" &&
    n.schemaVersion >= CURRENT_SCHEMA_VERSION
  ) {
    return false;
  }
  return true;
}

// 单条迁移。不修改入参，返回新对象；不需要迁移时原样返回入参。
export function migrateNotice(n) {
  if (!n || typeof n !== "object") return n;
  if (!needsMigrate(n)) return n;

  const out = {};
  const keys = Object.keys(n);
  for (let i = 0; i < keys.length; i++) {
    out[keys[i]] = n[keys[i]];
  }

  let items = [];
  try {
    const text = n.text == null ? "" : String(n.text);
    // 老通知可能已经存过发布日期，有就用，没有就传空串保持待确认
    const base = typeof n.publishedAt === "string" ? n.publishedAt : "";
    const built = buildItems(text, { publishedAt: base });
    items = Array.isArray(built) ? built : [];
  } catch (e) {
    items = [];
  }

  out.items = items;
  out.schemaVersion = CURRENT_SCHEMA_VERSION;
  return out;
}

// 整表迁移。条数不变，顺序不变。
export function migrateNotices(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (let i = 0; i < list.length; i++) {
    out.push(migrateNotice(list[i]));
  }
  return out;
}
