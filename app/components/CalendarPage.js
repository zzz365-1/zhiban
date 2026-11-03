"use client";

import { useState } from "react";
import { buildMonthGrid, formatDateKey } from "../lib/calendar.js";
import { buildRouteEvents } from "../lib/routeEvents.js";
import { formatRemaining } from "../lib/todo.js";
import { StatusPill, EmptyState } from "./ui/ZbUI.js";
import {
  IconChevronRight,
  IconClock,
  IconPin,
  IconFile,
} from "./ui/Icons.js";

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

const TYPE_LABEL = {
  deadline: "办理截止",
  start: "活动开始",
};

const TYPE_CHIP_STYLE = {
  deadline: "bg-blue-50 text-blue-700",
  start: "bg-violet-50 text-violet-700",
};

function dotClass(level) {
  if (level === "red") return "bg-red-500";
  if (level === "amber") return "bg-amber-500";
  if (level === "expired") return "bg-slate-400";
  return "bg-blue-600";
}

export default function CalendarPage({ notices, now, onOpenItem }) {
  const today = new Date(typeof now === "number" ? now : Date.now());
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedKey, setSelectedKey] = useState(null);

  // 事项照样从摊平事件那个模块来，日历和待办才不会各说各话
  const events = buildRouteEvents(notices || []);

  const byDate = {};
  for (const ev of events) {
    const key = formatDateKey(ev.date);
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(ev);
  }

  for (const key of Object.keys(byDate)) {
    byDate[key].sort((a, b) => a.ts - b.ts);
  }

  const grid = buildMonthGrid(viewYear, viewMonth);
  const todayKey = formatDateKey(today);

  function prevMonth() {
    if (viewMonth === 0) {
      setViewYear(viewYear - 1);
      setViewMonth(11);
    } else {
      setViewMonth(viewMonth - 1);
    }
    setSelectedKey(null);
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewYear(viewYear + 1);
      setViewMonth(0);
    } else {
      setViewMonth(viewMonth + 1);
    }
    setSelectedKey(null);
  }

  function goToday() {
    const d = new Date(typeof now === "number" ? now : Date.now());
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setSelectedKey(null);
  }

  const selectedItems = selectedKey ? byDate[selectedKey] || [] : [];

  let selectedDateLabel = "选择一天";
  if (selectedKey) {
    const parts = selectedKey.split("-");
    selectedDateLabel = parts[1] + "月" + parts[2] + "日";
  }

  const hasEvents = events.length > 0;

  return (
    <div className="flex h-full min-h-0 w-full bg-[#F5F7FB]">
      {/* 左栏：日历本体 */}
      <div className="min-w-0 flex-1 p-5">
        <div className="rounded-[12px] border border-[#E2E8F0] bg-white p-4 shadow-[0_0.5px_3px_rgba(15,23,42,0.06)]">
          {/* 顶部：月份切换 */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={prevMonth}
                aria-label="上个月"
                className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#E2E8F0] bg-white text-slate-600 transition duration-200 ease-out hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 motion-reduce:transition-none"
              >
                <IconChevronRight size={16} className="rotate-180" />
              </button>
              <span className="text-[15px] font-bold text-[#0F172A]">
                {viewYear} 年 {viewMonth + 1} 月
              </span>
              <button
                type="button"
                onClick={nextMonth}
                aria-label="下个月"
                className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#E2E8F0] bg-white text-slate-600 transition duration-200 ease-out hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 motion-reduce:transition-none"
              >
                <IconChevronRight size={16} />
              </button>
            </div>
            <button
              type="button"
              onClick={goToday}
              className="inline-flex h-8 items-center justify-center rounded-[8px] border border-[#E2E8F0] bg-white px-3 text-[13px] font-medium text-slate-700 transition duration-200 ease-out hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 motion-reduce:transition-none"
            >
              回到本月
            </button>
          </div>

          {/* 星期表头 */}
          <div className="mt-4 grid grid-cols-7 border-b border-[#E2E8F0]">
            {WEEKDAY_LABELS.map((w) => (
              <div
                key={w}
                className="py-2 text-center text-xs text-[#64748B]"
              >
                {w}
              </div>
            ))}
          </div>

          {/* 月历格子 */}
          <div className="mt-2 grid grid-cols-7 gap-px bg-[#E2E8F0]">
            {grid.map((cell, i) => {
              const key = formatDateKey(cell.date);
              const items = byDate[key] || [];
              const isToday = key === todayKey;
              const isSelected = key === selectedKey;

              let dotLevel = null;
              for (const ev of items) {
                const lv = formatRemaining(ev.ts, now).level;
                if (lv === "red") {
                  dotLevel = "red";
                  break;
                }
                if (lv === "amber" && dotLevel !== "red") dotLevel = "amber";
                if (lv === "expired" && dotLevel === null) dotLevel = "expired";
                if (lv === "blue" && dotLevel === null) dotLevel = "blue";
              }

              const maxVisible = 3;
              const visibleItems = items.slice(0, maxVisible);
              const overflowCount = items.length - visibleItems.length;

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedKey(key)}
                  aria-pressed={isSelected}
                  className={[
                    "relative flex min-h-[92px] flex-col items-stretch gap-1 p-1.5 text-left transition-[background-color,border-color,box-shadow] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 motion-reduce:transition-none",
                    cell.inMonth ? "bg-white" : "bg-slate-50",
                    isSelected
                      ? "bg-blue-50 ring-1 ring-inset ring-blue-600"
                      : "hover:bg-slate-50",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={[
                        "flex h-6 w-6 items-center justify-center rounded-full text-[13px]",
                        isToday
                          ? "bg-blue-600 font-bold text-white"
                          : cell.inMonth
                          ? "font-medium text-[#0F172A]"
                          : "text-slate-300",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {cell.date.getDate()}
                    </span>
                    {items.length > 0 && (
                      <span
                        aria-hidden="true"
                        className={`h-1.5 w-1.5 rounded-full ${dotClass(
                          dotLevel
                        )}`}
                      />
                    )}
                  </div>

                  {visibleItems.length > 0 && (
                    <div className="flex flex-col gap-1">
                      {visibleItems.map((ev, idx) => {
                        const done =
                          ev.progress === "已办理" ||
                          ev.progress === "无需办理";
                        const typeStyle =
                          TYPE_CHIP_STYLE[ev.timeType] ||
                          TYPE_CHIP_STYLE.deadline;
                        return (
                          <span
                            key={ev.noticeId + "-" + ev.itemIndex + "-" + idx}
                            className={[
                              "block h-5 truncate rounded-[4px] px-1.5 text-[11px] leading-5",
                              typeStyle,
                              done ? "line-through opacity-60" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          >
                            {ev.name}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {overflowCount > 0 && (
                    <span className="text-[10px] text-[#64748B]">
                      还有 {overflowCount} 条
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {!hasEvents && (
          <p className="mt-3 text-xs text-[#64748B]">
            还没有可以排进日历的事项，先新增一条通知并解析，日期确定之后会出现在这里。
          </p>
        )}
      </div>

      {/* 右栏：当天事项 */}
      <aside className="flex w-[360px] flex-none flex-col overflow-y-auto border-l border-[#E2E8F0] bg-white p-4">
        <h2 className="text-[15px] font-bold text-[#0F172A]">
          {selectedDateLabel}
        </h2>
        <p className="mt-1 text-xs text-[#64748B]">
          这一天一共有 {selectedItems.length} 条事项
        </p>

        {selectedItems.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="这一天没有安排"
              description="点左边日历上的某一天，看看那天要做什么。"
            />
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {selectedItems.map((ev, i) => {
              const done =
                ev.progress === "已办理" || ev.progress === "无需办理";
              const typeStyle =
                TYPE_CHIP_STYLE[ev.timeType] || TYPE_CHIP_STYLE.deadline;
              const typeLabel =
                TYPE_LABEL[ev.timeType] || TYPE_LABEL.deadline;
              const materials = Array.isArray(ev.materials)
                ? ev.materials
                : [];
              const materialNames = materials
                .map((m) => (m && typeof m === "object" ? m.name : m))
                .filter((m) => m !== null && m !== undefined && m !== "");

              return (
                <li key={ev.noticeId + "-" + ev.itemIndex + "-" + i}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpenItem && onOpenItem(ev)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (onOpenItem) onOpenItem(ev);
                      }
                    }}
                    className="cursor-pointer rounded-[10px] border border-[#E2E8F0] bg-white p-3 shadow-[0_0.5px_2px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] duration-200 ease-out hover:border-blue-200 hover:shadow-[0_1px_6px_rgba(15,23,42,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 motion-reduce:transition-none"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`rounded-[6px] px-2 py-0.5 text-xs font-medium leading-5 ${typeStyle}`}
                      >
                        {typeLabel}
                      </span>
                      <StatusPill status={ev.progress} size="sm" />
                    </div>

                    <p
                      className={[
                        "mt-2 max-h-[2.6em] overflow-hidden text-sm font-bold leading-snug text-[#0F172A]",
                        done ? "line-through text-slate-400" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {ev.name}
                    </p>

                    <div className="mt-1.5 space-y-1 text-xs text-[#64748B]">
                      <p className="flex items-center gap-1.5">
                        <IconClock
                          size={14}
                          className="flex-none text-slate-400"
                        />
                        <span className="truncate">{ev.time}</span>
                      </p>
                      {ev.location && (
                        <p className="flex items-center gap-1.5">
                          <IconPin
                            size={14}
                            className="flex-none text-slate-400"
                          />
                          <span className="truncate">{ev.location}</span>
                        </p>
                      )}
                      {materialNames.length > 0 && (
                        <p className="flex items-start gap-1.5">
                          <IconFile
                            size={14}
                            className="mt-0.5 flex-none text-slate-400"
                          />
                          <span>{materialNames.join("、")}</span>
                        </p>
                      )}
                    </div>

                    <p className="mt-2 truncate text-[11px] text-slate-400">
                      {ev.noticeTitle}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    </div>
  );
}
