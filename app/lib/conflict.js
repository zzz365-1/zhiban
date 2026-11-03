/**
 * 日程冲突提醒。纯函数模块，不依赖任何浏览器接口。
 *
 * 输入是 buildRouteEvents 摊平后的事件数组（每条事项一条），
 * 输出是一串提醒对象 { key, type, level, title, detail, items }。
 *
 * 三种提醒：
 *  - overlap     确定的时间重叠（两个都有开始和结束、同一天、区间真正相交）
 *  - cluster     同一天截止事项集中（>= 2 项，不含已办理 / 无需办理）
 *  - needEndTime 只有开始时间、没有结束时间，无法判断是否重叠
 *
 * 本模块只算提醒，绝不修改传进来的事件对象，也不会去改任何时间。
 */

/**
 * 把“日期对象 + HH:mm 字符串”拼成一个毫秒时间戳。
 * 年月日取自 date 对象，时分取自 timeStr，秒和毫秒给 0。
 * 不合法（timeStr 不是 HH:mm、或 date 无效）返回 null。
 *
 * 只读 date，不改它，另建新对象。
 */
function toTimestamp(date, timeStr) {
  if (!(date instanceof Date)) return null;
  if (Number.isNaN(date.getTime())) return null;
  if (typeof timeStr !== "string") return null;

  const m = /^([0-9]{2}):([0-9]{2})$/.exec(timeStr);
  if (!m) return null;

  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;

  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hh,
    mm,
    0,
    0
  ).getTime();
}

/** 同类日期判断：年月日三个都相同 */
function isSameDay(a, b) {
  if (!(a instanceof Date) || !(b instanceof Date)) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** 提取精简事件信息，供界面点进去看原文 */
function slimItem(ev) {
  return {
    noticeId: ev.noticeId,
    itemIndex: ev.itemIndex,
    name: ev.name || "",
    time: ev.time || "",
    endTime: ev.endTime || "",
    noticeTitle: ev.noticeTitle || "",
  };
}

/**
 * 把分钟数格式化成中文。
 * 60 → 一小时，90 → 一小时三十分，45 → 四十五分钟，120 → 两小时。
 * 整小时不写“零分”，不足一小时只写分钟。
 */
export function formatDuration(minutes) {
  const total = Math.round(minutes);

  const DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

  function toCN(n) {
    if (n <= 0) return "零";
    if (n < 10) return DIGITS[n];
    if (n < 20) return "十" + (n % 10 === 0 ? "" : DIGITS[n % 10]);
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return DIGITS[tens] + "十" + (ones === 0 ? "" : DIGITS[ones]);
  }

  // 小时数：2 写成“两”，其余用中文数字
  function toHourCN(n) {
    return n === 2 ? "两" : toCN(n);
  }

  const h = Math.floor(total / 60);
  const m = total % 60;

  // 整小时：数字 + 小时
  if (h > 0 && m === 0) return toHourCN(h) + "小时";
  // 有小时有零头：小时 + 小时 + 分钟数 + 分（分钟只写一个“分”字）
  if (h > 0) return toHourCN(h) + "小时" + toCN(m) + "分";
  // 不足一小时：分钟数 + 分钟（写完整“分钟”）
  return toCN(m) + "分钟";
}

/** HH:mm 字符串，直接从毫秒时间戳取本地时分 */
function hmFromTs(ts) {
  const d = new Date(ts);
  return (
    String(d.getHours()).padStart(2, "0") +
    ":" +
    String(d.getMinutes()).padStart(2, "0")
  );
}

/**
 * 计算提醒。返回已排序的提醒数组。
 */
export function buildScheduleAlerts(events) {
  const list = Array.isArray(events) ? events : [];

  const alerts = [];

  // ---------- 1. 确定的时间重叠 ----------
  // 先把 start 且带结束时间、时间段合法的事件挑出来，按开始时间戳排序，
  // 这样两层循环时“排前面的”就是开始时间早的那个，key 稳定。
  const overlapCandidates = [];
  for (const ev of list) {
    if (ev.timeType !== "start") continue;
    if (!ev.time || !ev.endTime) continue;

    const start = toTimestamp(ev.date, ev.time);
    const end = toTimestamp(ev.date, ev.endTime);
    if (start === null || end === null) continue;
    // 结束早于开始：跨午夜，不猜，按信息不足处理（见下面 needEndTime 分支会覆盖）
    if (end < start) continue;

    overlapCandidates.push({ ev, start, end });
  }

  overlapCandidates.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    const ka = String(a.ev.noticeId) + "|" + String(a.ev.itemIndex);
    const kb = String(b.ev.noticeId) + "|" + String(b.ev.itemIndex);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  for (let i = 0; i < overlapCandidates.length - 1; i++) {
    for (let j = i + 1; j < overlapCandidates.length; j++) {
      const A = overlapCandidates[i];
      const B = overlapCandidates[j];

      // 同一天（年月日）
      if (!isSameDay(A.ev.date, B.ev.date)) continue;

      // 严格小于：无缝衔接（A 结束 == B 开始）不算重叠
      const overlapStart = Math.max(A.start, B.start);
      const overlapEnd = Math.min(A.end, B.end);
      if (!(overlapStart < overlapEnd)) continue;

      const minutes = (overlapEnd - overlapStart) / 60000;
      if (minutes <= 0) continue;

      const key =
        "overlap|" +
        String(A.ev.noticeId) +
        "|" +
        String(A.ev.itemIndex) +
        "|" +
        String(B.ev.noticeId) +
        "|" +
        String(B.ev.itemIndex);

      const nameA = A.ev.name || "";
      const nameB = B.ev.name || "";
      const segStart = hmFromTs(overlapStart);
      const segEnd = hmFromTs(overlapEnd);
      const dur = formatDuration(minutes);

      alerts.push({
        key,
        type: "overlap",
        level: "warn",
        title: "时间冲突",
        detail:
          nameA +
          "（" +
          A.ev.time +
          " 到 " +
          A.ev.endTime +
          "）和" +
          nameB +
          "（" +
          B.ev.time +
          " 到 " +
          B.ev.endTime +
          "）重叠" +
          dur +
          "，重叠时段是 " +
          segStart +
          " 到 " +
          segEnd +
          "。",
        items: [slimItem(A.ev), slimItem(B.ev)],
        _sortTs: Math.min(A.start, B.start),
      });
    }
  }

  // ---------- 2. 截止事项集中 ----------
  const deadlineByDay = new Map();
  for (const ev of list) {
    if (ev.timeType !== "deadline") continue;
    if (ev.progress === "已办理" || ev.progress === "无需办理") continue;
    if (!(ev.date instanceof Date) || Number.isNaN(ev.date.getTime())) continue;

    const dayKey =
      ev.date.getFullYear() +
      "-" +
      (ev.date.getMonth() + 1) +
      "-" +
      ev.date.getDate();

    if (!deadlineByDay.has(dayKey)) {
      deadlineByDay.set(dayKey, { date: ev.date, events: [] });
    }
    deadlineByDay.get(dayKey).events.push(ev);
  }

  for (const [dayKey, group] of deadlineByDay) {
    if (group.events.length < 2) continue;

    // 组内按开始时间排序，保证“前三项”稳定
    group.events.sort((a, b) => {
      const ta = typeof a.ts === "number" ? a.ts : Infinity;
      const tb = typeof b.ts === "number" ? b.ts : Infinity;
      if (ta !== tb) return ta - tb;
      const ka = String(a.noticeId) + "|" + String(a.itemIndex);
      const kb = String(b.noticeId) + "|" + String(b.itemIndex);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });

    const names = group.events.map((e) => e.name || "");
    const shown = names.slice(0, 3).join("、") + (names.length > 3 ? "等" : "");

    const d = group.date;
    const dateCN =
      d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日";

    alerts.push({
      key: "cluster|" + dayKey,
      type: "cluster",
      level: "info",
      title: "截止事项集中",
      detail:
        dateCN +
        "一共有 " +
        group.events.length +
        " 项要办：" +
        shown +
        "。",
      items: group.events.map(slimItem),
      _sortTs: typeof group.events[0].ts === "number" ? group.events[0].ts : Infinity,
    });
  }

  // ---------- 3. 信息不足：缺结束时间 ----------
  // 同一事件只产生一条。
  for (const ev of list) {
    if (ev.timeType !== "start") continue;
    if (!ev.time) continue; // 没有开始时间不在本类

    // 有结束时间且可解析，就不算缺；若结束早于开始（跨午夜），仍按信息不足处理
    let needsEnd = false;
    if (!ev.endTime) {
      needsEnd = true;
    } else {
      const start = toTimestamp(ev.date, ev.time);
      const end = toTimestamp(ev.date, ev.endTime);
      if (start === null || end === null) {
        needsEnd = true;
      } else if (end < start) {
        needsEnd = true; // 跨午夜，不猜
      }
    }
    if (!needsEnd) continue;

    const start = toTimestamp(ev.date, ev.time);

    alerts.push({
      key:
        "need|" + String(ev.noticeId) + "|" + String(ev.itemIndex),
      type: "needEndTime",
      level: "info",
      title: "结束时间待补充",
      detail:
        "“" +
        (ev.name || "") +
        "”只有开始时间 " +
        ev.time +
        "，不确定什么时候结束，暂时不能判断是否与其他活动重叠。不会替你假设活动时长。",
      items: [slimItem(ev)],
      _sortTs: start === null ? Infinity : start,
    });
  }

  // ---------- 排序：overlap → cluster → needEndTime；同类按最早时间戳升序 ----------
  const order = { overlap: 0, cluster: 1, needEndTime: 2 };
  alerts.sort((a, b) => {
    const oa = order[a.type];
    const ob = order[b.type];
    if (oa !== ob) return oa - ob;
    if (a._sortTs !== b._sortTs) return a._sortTs - b._sortTs;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });

  // 去掉内部排序用字段
  for (const a of alerts) delete a._sortTs;

  return alerts;
}
