/**
 * 旧通知数据迁移。
 *
 * 【为什么必须有这一层】
 * 事项是后加的，老数据只有一份扁平字段。
 * 直接丢掉老数据不行，用户存过的通知一条都不能少。
 * 所以读取时补出 items，原有字段原样保留，只加一个 schemaVersion 标记。
 */

import { buildItems } from "./noticeItems.js";

export const SCHEMA_VERSION = 2;

export function migrateNotice(notice) {
  if (!notice || typeof notice !== "object") return notice;

  const already = notice.schemaVersion === SCHEMA_VERSION;
  const hasItems = Array.isArray(notice.items) && notice.items.length > 0;
  if (already && hasItems) return notice;

  const items = hasItems
    ? notice.items
    : buildItems(notice.text || "", {
        publishedAt: notice.publishedAt || null,
      });

  return {
    ...notice,
    items,
    schemaVersion: SCHEMA_VERSION,
  };
}

export function migrateNotices(list) {
  if (!Array.isArray(list)) return [];
  return list.map(migrateNotice);
}
