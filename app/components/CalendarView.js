"use client";

import { useState } from "react";
import { buildMonthGrid, formatDateKey } from "../lib/calendar";
import { formatRemaining, formatTimeHM } from "../lib/todo";

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

function dotClass(level) {
  if (level === "red") return "bg-red-500";
  if (level === "amber") return "bg-amber-500";
  if (level === "expired") return "bg-slate-400";
  return "bg-blue-500";
}

export default function CalendarView({ notices, now }) {
  const today = new Date(now);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedKey, setSelectedKey] = useState(null);

  const grid = buildMonthGrid(viewYear, viewMonth);

  // 按日期分组
  const byDate = {};
  for (const n of notices) {
    if (!n.deadlineDate) continue;
    const key = formatDateKey(new Date(n.deadlineDate));
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(n);
  }

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

  const selectedItems = selectedKey ? byDate[selectedKey] || [] : [];

  let selectedDateLabel = "";
  if (selectedKey) {
    const parts = selectedKey.split("-");
    selectedDateLabel = parts[1] + "月" + parts[2] + "日";
  }

  return (
    <aside className="flex h-full flex-col border-r border-slate-200 bg-white">
      <div className="flex flex-none items-center justify-between border-b border-slate-100 px-4 py-3">
        <button
          type="button"
          onClick={prevMonth}
          className="h-7 w-7 rounded-md text-slate-500 transition hover:bg-slate-100"
          aria-label="上个月"
        >
          ‹
        </button>
        <span className="text-sm font-medium text-slate-700">
          {viewYear} 年 {viewMonth + 1} 月
        </span>
        <button
          type="button"
          onClick={nextMonth}
          className="h-7 w-7 rounded-md text-slate-500 transition hover:bg-slate-100"
          aria-label="下个月"
        >
          ›
        </button>
      </div>

      <div className="grid flex-none grid-cols-7 border-b border-slate-100">
        {WEEKDAY_LABELS.map((w) => (
          <div
            key={w}
            className="py-1.5 text-center text-[11px] text-slate-400"
          >
            {w}
          </div>
        ))}
      </div>

      <div className="grid flex-none grid-cols-7">
        {grid.map((cell, i) => {
          const key = formatDateKey(cell.date);
          const items = byDate[key] || [];
          const isToday = key === todayKey;
          const isSelected = key === selectedKey;

          let dotLevel = null;
          for (const item of items) {
            const lv = formatRemaining(item.deadlineDate, now).level;
            if (lv === "red") {
              dotLevel = "red";
              break;
            }
            if (lv === "amber" && dotLevel !== "red") dotLevel = "amber";
            if (lv === "expired" && dotLevel === null) dotLevel = "expired";
            if (lv === "blue" && dotLevel === null) dotLevel = "blue";
          }

          return (
            <button
              key={i}
              type="button"
              onClick={() => setSelectedKey(key)}
              className={`relative flex h-10 flex-col items-center justify-center border border-slate-50 text-xs transition ${
                cell.inMonth ? "text-slate-700" : "text-slate-300"
              } ${isSelected ? "bg-blue-50" : "hover:bg-slate-50"}`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full ${
                  isToday ? "bg-blue-600 font-medium text-white" : ""
                }`}
              >
                {cell.date.getDate()}
              </span>
              {items.length > 0 && (
                <span
                  className={`mt-0.5 h-1 w-1 rounded-full ${dotClass(dotLevel)}`}
                />
              )}
            </button>
          );
        })}
      </div>

      {selectedKey && (
        <div className="flex-1 overflow-y-auto border-t border-slate-100 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-500">
            {selectedDateLabel}
          </p>
          {selectedItems.length === 0 && (
            <p className="text-xs text-slate-400">这天没有事项。</p>
          )}
          {selectedItems.length > 0 && (
            <ul className="space-y-2">
              {selectedItems.map((item) => (
                <li
                  key={item.id}
                  className="rounded-lg border border-slate-200 bg-white p-2.5"
                >
                  <p className="text-sm font-medium leading-snug text-slate-800">
                    {item.title}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatTimeHM(item.deadlineDate)}
                  </p>
                  {item.analysis && item.analysis.location && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      地点：{item.analysis.location}
                    </p>
                  )}
                  {item.analysis &&
                    item.analysis.materials &&
                    item.analysis.materials.length > 0 && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        材料：{item.analysis.materials.join("、")}
                      </p>
                    )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </aside>
  );
}