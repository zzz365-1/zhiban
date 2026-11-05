/**
 * 把通知摊平成日历事件（每个事项一条）。纯函数。
 *
 * 日历和待办都要走它，因为事项才是真正要做的事；之前两边各看整条通知的
 * 一个截止时间，改了一边另一边不动。摊平后日历按事件分组、待办按事件筛选，
 * 数据同源，改日期/办理状态两边才对得上。
 */

import { buildDeadlineDate, hasExplicitTime, NO_TIME_NOTE } from "./deadline.js";

/**
 * 把一批通知摊平成一串日历事件。每个事件对应一个事项。
 * 返回 [{ noticeId, noticeTitle, itemIndex, name, date, time, ts, location, materials, progress, timeType }]
 *
 * 规矩：
 *  - 有事项按事项摊；无事项的老数据退回整条通知的 deadlineDate / title 出一条。
 *  - 事项日期算不出来（date 字段 status 为 pending，或 buildDeadlineDate 返回 null）→ 跳过。
 *  - 已完成 / 无需办理 也要出现在日历里，带 progress。
 *  - 时间戳复用 buildDeadlineDate，存为数字。
 */
export function buildRouteEvents(notices) {
  const events = [];

  for (const n of notices) {
    // 事项存在两处：analysis.items 是界面改动落地的、最新的一份，
    // 通知最外层 n.items 是旧副本。优先取 analysis.items，没有再退回 n.items。
    // 这两处必须同时更新，改一处不改另一处就会出现界面变了日历没变。
    const items = Array.isArray(n.analysis && n.analysis.items)
      ? n.analysis.items
      : Array.isArray(n.items)
      ? n.items
      : [];

    if (items.length === 0) {
      // 老数据：整条通知自己的截止时间 + 标题
      if (!n.deadlineDate) continue;
      const d = new Date(n.deadlineDate);
      const hasTime = hasExplicitTime(n.analysis && n.analysis.time);
      events.push({
        noticeId: n.id,
        noticeTitle: n.title || "",
        itemIndex: 0,
        name: n.title || "",
        date: d,
        time: hasTime
          ? String(d.getHours()).padStart(2, "0") +
            ":" +
            String(d.getMinutes()).padStart(2, "0")
          : "",
        hasExplicitTime: hasTime,
        timeNote: hasTime ? "" : NO_TIME_NOTE,
        endTime: "",
        ts: n.deadlineDate,
        location: (n.analysis && n.analysis.location) || "",
        materials: (n.analysis && n.analysis.materials) || [],
        progress: "待办理",
        timeType: "deadline",
      });
      continue;
    }

    items.forEach((item, index) => {
      // 字段状态里 date 为 pending 的，直接跳过
      if (item.status && item.status.date === "pending") return;

      const dateStr = item.date || "";
      const ts = buildDeadlineDate(dateStr, item.time);
      if (ts === null) return; // 算不出来，跳过，不硬塞

      const tsNum = ts.getTime();
      const hasTime = hasExplicitTime(item && item.time);
      events.push({
        noticeId: n.id,
        noticeTitle: n.title || "",
        itemIndex: index,
        name: item.name || "",
        date: ts,
        time: hasTime
          ? String(ts.getHours()).padStart(2, "0") +
            ":" +
            String(ts.getMinutes()).padStart(2, "0")
          : "",
        hasExplicitTime: hasTime,
        timeNote: hasTime ? "" : NO_TIME_NOTE,
        endTime: (item && item.endTime) || "",
        ts: tsNum,
        location: item.location || "",
        materials: item.materials || [],
        progress: item.progress || "待办理",
        timeType: item.timeType || "deadline",
      });
    });
  }

  return events;
}
