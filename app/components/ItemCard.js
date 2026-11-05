"use client";

import { Card, Chip, StatusPill, Button } from "./ui/ZbUI.js";
import { NO_TIME_NOTE } from "../lib/deadline.js";
import {
  IconClock,
  IconPin,
  IconFile,
  IconList,
  IconCheck,
  IconAlert,
} from "./ui/Icons.js";

const DAY_MS = 86400000;
const HOUR_MS = 3600000;

function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * 只有日期、没有明确时刻时用的写法：不带时分。
 */
function formatDateOnly(ts) {
  const d = new Date(ts);
  return d.getMonth() + 1 + "月" + d.getDate() + "日";
}

function formatWhen(ts) {
  const d = new Date(ts);
  return (
    d.getMonth() +
    1 +
    "月" +
    d.getDate() +
    "日 " +
    pad2(d.getHours()) +
    ":" +
    pad2(d.getMinutes())
  );
}

/**
 * 剩余时间标签：按 now 与 ts 计算。
 * 已过 → 已过期 neutral
 * 小于一小时 → 不到一小时 danger
 * 小于一天 → 剩 N 小时 danger
 * 三天以内 → 剩 N 天 warn
 * 超过三天 → 剩 N 天 brand
 */
function remainingLabel(ts, now, dateOnly = false) {
  const diff = ts - now;
  if (diff < 0) {
    return { text: "已过期", tone: "neutral" };
  }
  // 只有日期、不知道几点时，不按小时估算，退到按天说。
  if (dateOnly) {
    const days = Math.floor(diff / DAY_MS);
    if (days < 1) return null;
    const tone = days <= 3 ? "warn" : "brand";
    return { text: "剩 " + days + " 天", tone };
  }
  if (diff < HOUR_MS) {
    return { text: "不到一小时", tone: "danger" };
  }
  if (diff < DAY_MS) {
    const hours = Math.floor(diff / HOUR_MS);
    return { text: "剩 " + hours + " 小时", tone: "danger" };
  }
  const days = Math.floor(diff / DAY_MS);
  const tone = days <= 3 ? "warn" : "brand";
  return { text: "剩 " + days + " 天", tone };
}

function materialName(m) {
  if (typeof m === "string") return m;
  if (m && typeof m === "object") {
    if (typeof m.name === "string") return m.name;
    return String(m.name || "");
  }
  return "";
}

export default function ItemCard({
  event,
  now,
  selected = false,
  onOpen,
  onComplete,
  onToggleMaterial,
  alerts,
}) {
  if (!event) return null;

  const {
    name,
    ts,
    location,
    materials,
    progress,
    timeType,
    noticeTitle,
    hasExplicitTime,
    timeNote,
  } = event;

  // 没有明确时刻（hasExplicitTime 明确为 false）时，只按日期显示。
  // 老数据没有这个字段时当作有明确时刻，行为跟以前一致。
  const explicitTime = hasExplicitTime !== false;

  const safeNow = typeof now === "number" ? now : Date.now();
  const safeTs = typeof ts === "number" ? ts : null;

  const isDone = progress === "已办理";

  const remaining =
    safeTs !== null
      ? remainingLabel(safeTs, safeNow, !explicitTime)
      : null;

  const timeTypeChip =
    timeType === "start"
      ? { text: "活动开始", tone: "accent" }
      : { text: "办理截止", tone: "brand" };

  const materialList = Array.isArray(materials) ? materials : [];
  const showMaterials = materialList.length > 0;
  const canToggleMaterial = typeof onToggleMaterial === "function";

  const handleComplete = () => {
    if (!onComplete) return;
    onComplete(isDone ? "待办理" : "已办理");
  };

  // ---- 本事项相关的提醒，只取最严重的一条 ----
  // 只显示一行标签，完整内容在日历和工作台的提醒区展开，
  // 不然同一个警告会在页面上叠出好几遍。
  const RELATED_ORDER = { overlap: 0, cluster: 1, needEndTime: 2 };
  let relatedAlert = null;
  if (Array.isArray(alerts) && event) {
    for (const a of alerts) {
      const its = Array.isArray(a.items) ? a.items : [];
      const hit = its.some(
        (it) =>
          String(it.noticeId) === String(event.noticeId) &&
          String(it.itemIndex) === String(event.itemIndex)
      );
      if (!hit) continue;
      const rankA = RELATED_ORDER[a.type] == null ? 9 : RELATED_ORDER[a.type];
      const rankB =
        relatedAlert == null ? 9 : RELATED_ORDER[relatedAlert.type] == null
          ? 9
          : RELATED_ORDER[relatedAlert.type];
      if (relatedAlert === null || rankA < rankB) {
        relatedAlert = a;
      }
    }
  }

  const ALERT_TAG_CONF = {
    overlap: {
      label: "时间冲突",
      Icon: IconAlert,
      cls: "border-amber-200 bg-amber-50 text-amber-800",
    },
    cluster: {
      label: "截止事项集中",
      Icon: IconList,
      cls: "border-blue-200 bg-blue-50 text-blue-800",
    },
    needEndTime: {
      label: "结束时间待补充",
      Icon: IconClock,
      cls: "border-blue-200 bg-blue-50 text-blue-800",
    },
  };

  return (
    <div
      className={[
        "zb-enter transition-[border-color,box-shadow] duration-200 ease-out motion-reduce:transition-none",
        isDone ? "opacity-70" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Card selected={selected} onClick={onOpen}>
        {/* 第一行：状态 + 时间类型 */}
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <StatusPill status={progress} size="sm" />
          <Chip tone={timeTypeChip.tone}>{timeTypeChip.text}</Chip>
        </div>

        {/* 第二行：标题 */}
        <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-[#0F172A]">
          {name}
        </h3>

        {/* 信息列表 */}
        <div className="mt-2.5 space-y-1.5">
          {/* 何时 */}
          {safeTs !== null ? (
            <div className="flex items-center gap-2">
              <IconClock size={16} className="flex-none text-[#94A3B8]" />
              <span className="min-w-0 flex-1 truncate text-[13px] text-[#64748B]">
                <span className="font-medium text-[#0F172A]">
                  {explicitTime ? formatWhen(safeTs) : formatDateOnly(safeTs)}
                </span>
                {!explicitTime ? (
                  <span className="ml-1 text-[#94A3B8]">
                    {timeNote || NO_TIME_NOTE}
                  </span>
                ) : null}
              </span>
              {remaining ? (
                <Chip tone={remaining.tone} className="flex-none">
                  {remaining.text}
                </Chip>
              ) : null}
            </div>
          ) : null}

          {/* 去哪 */}
          {location ? (
            <div className="flex items-center gap-2">
              <IconPin size={16} className="flex-none text-[#94A3B8]" />
              <span className="min-w-0 flex-1 truncate text-[13px] text-[#64748B]">
                去哪：
                <span className="font-medium text-[#0F172A]">{location}</span>
              </span>
            </div>
          ) : null}

          {/* 准备什么 */}
          {showMaterials ? (
            <div className="flex items-start gap-2">
              <IconFile
                size={16}
                className="mt-0.5 flex-none text-[#94A3B8]"
              />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-[#64748B]">准备什么：</div>
                <ul className="mt-1 space-y-1">
                  {materialList.map((m, index) => {
                    const label = materialName(m);
                    // 材料对象上表示已勾选的键叫 ready，不是 checked
                    const checked =
                      m && typeof m === "object" ? !!m.ready : false;
                    const rowInner = (
                      <>
                        {canToggleMaterial ? (
                          <span
                            aria-hidden="true"
                            className={[
                              "flex h-3.5 w-3.5 flex-none items-center justify-center rounded-[3px] border",
                              checked
                                ? "border-[#2563EB] bg-[#2563EB] text-white"
                                : "border-[#CBD5E1] bg-white text-transparent",
                            ].join(" ")}
                          >
                            <IconCheck size={10} />
                          </span>
                        ) : null}
                        <span
                          className={[
                            "min-w-0 flex-1 text-[13px]",
                            checked
                              ? "text-[#64748B] line-through"
                              : "text-[#0F172A]",
                          ].join(" ")}
                        >
                          {label}
                        </span>
                      </>
                    );

                    if (!canToggleMaterial) {
                      return (
                        <li key={index} className="flex items-center gap-2">
                          {rowInner}
                        </li>
                      );
                    }

                    return (
                      <li key={index}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={checked}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleMaterial(index, !checked);
                          }}
                          className="flex w-full items-center gap-2 rounded-[6px] px-1 py-0.5 text-left transition-colors duration-200 ease-out hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 motion-reduce:transition-none"
                        >
                          {rowInner}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          ) : null}

          {/* 来自 */}
          {noticeTitle ? (
            <div className="flex items-center gap-2">
              <IconList size={16} className="flex-none text-[#94A3B8]" />
              <span className="min-w-0 flex-1 truncate text-[13px] text-[#64748B]">
                来自：
                <span className="font-medium text-[#0F172A]">
                  {noticeTitle}
                </span>
              </span>
            </div>
          ) : null}
        </div>

        {/* 相关提醒：只显示一行，不可点，完整内容去日历和工作台看 */}
        {relatedAlert
          ? (function () {
              const conf =
                ALERT_TAG_CONF[relatedAlert.type] ||
                ALERT_TAG_CONF.needEndTime;
              const TagIcon = conf.Icon;
              return (
                <div className="mt-2.5">
                  <span
                    className={[
                      "inline-flex max-w-full items-center gap-1.5 rounded-[6px] border px-2 py-0.5 text-[11px]",
                      conf.cls,
                    ].join(" ")}
                  >
                    <TagIcon size={12} className="flex-none" />
                    {(() => {
                      const t = relatedAlert.title || conf.label;
                      const same = t === conf.label;
                      return (
                        <>
                          <span className="truncate font-medium">{t}</span>
                          {same ? null : (
                            <span className="flex-none opacity-80">
                              · {conf.label}
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </span>
                </div>
              );
            })()
          : null}

        {/* 操作区 */}
        <div className="mt-4 flex items-center justify-between gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={(e) => {
              if (e && e.stopPropagation) e.stopPropagation();
              if (onOpen) onOpen();
            }}
          >
            查看详情
          </Button>
          <Button
            variant={isDone ? "ghost" : "primary"}
            size="sm"
            onClick={(e) => {
              if (e && e.stopPropagation) e.stopPropagation();
              handleComplete();
            }}
          >
            {isDone ? "撤销" : "标为已办理"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
