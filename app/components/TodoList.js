"use client";

import { useState } from "react";
import { formatRemaining, formatDateCN } from "../lib/todo";

const COLLAPSED_COUNT = 5;

function getBadgeClass(level) {
  if (level === "red") return "bg-red-100 text-red-600";
  if (level === "amber") return "bg-amber-100 text-amber-700";
  if (level === "expired") return "bg-slate-100 text-slate-400";
  return "bg-blue-50 text-blue-600";
}

export default function TodoList({ items, now }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <aside className="flex h-full flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          待办
        </h2>
      </div>

      {items.length === 0 && (
        <div className="px-5 py-8">
          <p className="text-sm leading-relaxed text-slate-500">
            未来三天没有要截止的事。
          </p>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            可以安心准备接下来的安排。
          </p>
        </div>
      )}

      {items.length > 0 && (
        <>
          <ul className="flex-1 overflow-y-auto">
            {(expanded ? items : items.slice(0, COLLAPSED_COUNT)).map((item) => {
              const remaining = formatRemaining(item.ts, now);
              return (
                <li
                  key={item.noticeId + "-" + item.itemIndex}
                  className="border-b border-slate-100 px-4 py-3"
                >
                  <p className="text-sm leading-snug text-slate-800">
                    {item.name}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${getBadgeClass(
                        remaining.level
                      )}`}
                    >
                      {remaining.text}
                    </span>
                    <span className="text-xs text-slate-400">
                      {formatDateCN(item.ts)}
                      {item.noticeTitle ? " · " + item.noticeTitle : ""}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          {!expanded && items.length > COLLAPSED_COUNT && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="border-t border-slate-100 px-4 py-2.5 text-xs text-blue-600 hover:bg-blue-50"
            >
              还有 {items.length - COLLAPSED_COUNT} 件，点击展开
            </button>
          )}
        </>
      )}
    </aside>
  );
}