/**
 * 把最近要截止的通知整理成一段文字，方便复制到班群。
 * 纯函数，页面和自检脚本共用。
 */

import { getCalendarDayDiff } from "./todo.js";
import { hasExplicitTime, NO_TIME_NOTE } from "./deadline.js";

const LF = String.fromCharCode(10);

/**
 * 取一条通知用于展示的标题。
 * 优先级：analysis.title（人工改过） > notice.title（保存时派生）
 *         > 原文第一行非空文本 > "未命名通知"
 */
export function getNoticeTitle(notice) {
  if (notice.analysis && notice.analysis.title) return notice.analysis.title;
  if (notice.title) return notice.title;

  const text = notice.text || "";
  for (const line of text.split(LF)) {
    const t = line.trim();
    if (t) return t.length > 40 ? t.slice(0, 40) + "…" : t;
  }
  return "未命名通知";
}

export function formatShareDateTime(ts, time) {
  const d = new Date(ts);
  const mo = d.getMonth() + 1;
  const day = d.getDate();
  if (!hasExplicitTime(time)) {
    return mo + "月" + day + "日（" + NO_TIME_NOTE + "）";
  }
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return mo + "月" + day + "日 " + hh + ":" + mm;
}

/**
 * 筛选可分享的通知：
 *   - 有截止日期
 *   - 未过期
 *   - 剩余自然日 < rangeDays（rangeDays=3 表示今天、明天、后天）
 * 按截止时间升序。
 */
export function filterShareNotices(notices, nowTs, rangeDays) {
  return notices
    .filter((n) => {
      if (!n.deadlineDate) return false;
      if (n.deadlineDate <= nowTs) return false;
      const days = getCalendarDayDiff(n.deadlineDate, nowTs);
      return days >= 0 && days < rangeDays;
    })
    .sort((a, b) => a.deadlineDate - b.deadlineDate);
}

/**
 * 生成分享文字。
 * 格式：
 *   【知办】近期通知提醒
 *   M月D日 HH:MM - 标题（地点：xxx，材料：xxx）
 *   ...
 *   ——由知办自动整理
 */
export function buildShareText(notices, nowTs, rangeDays) {
  const items = filterShareNotices(notices, nowTs, rangeDays);

  if (items.length === 0) {
    return (
      "【知办】最近" +
      rangeDays +
      "天没有要截止的事项。" +
      LF +
      "——由知办自动整理"
    );
  }

  const lines = ["【知办】近期通知提醒"];

  for (const n of items) {
    const title = getNoticeTitle(n);
    const stamp = formatShareDateTime(
      n.deadlineDate,
      n.analysis ? n.analysis.time : null
    );
    let line = stamp + " - " + title;

    const extras = [];
    if (n.analysis && n.analysis.location) {
      extras.push("地点：" + n.analysis.location);
    }
    if (
      n.analysis &&
      n.analysis.materials &&
      n.analysis.materials.length > 0
    ) {
      extras.push("材料：" + n.analysis.materials.join("、"));
    }
    if (extras.length > 0) {
      line += "（" + extras.join("，") + "）";
    }

    lines.push(line);
  }

  lines.push("——由知办自动整理");
  return lines.join(LF);
}