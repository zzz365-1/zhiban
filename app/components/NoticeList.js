"use client";

import { getRemainingDays } from "../lib/deadline";

function getBadge(days) {
  if (days === null) {
    return { text: "无截止日期", cls: "bg-slate-100 text-slate-400" };
  }
  if (days < 0) {
    return { text: "已过期", cls: "bg-slate-100 text-slate-400" };
  }
  if (days === 0) {
    return { text: "今天到期", cls: "bg-red-100 text-red-600" };
  }
  if (days <= 3) {
    return { text: "剩 " + days + " 天", cls: "bg-red-100 text-red-600" };
  }
  if (days <= 7) {
    return { text: "剩 " + days + " 天", cls: "bg-amber-100 text-amber-700" };
  }
  return { text: "剩 " + days + " 天", cls: "bg-blue-50 text-blue-600" };
}

export default function NoticeList({ notices, selectedId, onSelect, onDelete, hydrated }) {
  return (
    <aside className="flex h-full flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          我的通知
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!hydrated && (
          <p className="px-5 py-6 text-xs text-slate-400">加载中…</p>
        )}

        {hydrated && notices.length === 0 && (
          <div className="px-5 py-8">
            <p className="text-sm leading-relaxed text-slate-500">
              还没有保存的通知。
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              在中间粘贴一条通知，点击「解析」，再点「保存到我的通知」，它就会出现在这里。
            </p>
          </div>
        )}

        {hydrated && notices.length > 0 && (
          <ul>
            {notices.map((notice) => {
              const isSelected = notice.id === selectedId;
              const days = getRemainingDays(notice.deadlineDate);
              const badge = getBadge(days);
              const expired = days !== null && days < 0;

              return (
                <li
                  key={notice.id}
                  className={`flex border-b border-slate-100 border-l-2 ${
                    isSelected
                      ? "border-l-blue-600 bg-blue-50"
                      : "border-l-transparent hover:bg-slate-50"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(notice.id)}
                    className="flex-1 px-4 py-3 text-left"
                  >
                    <p
                      className={`text-sm leading-snug ${
                        isSelected
                          ? "font-medium text-blue-700"
                          : expired
                          ? "text-slate-400"
                          : "text-slate-800"
                      }`}
                    >
                      {notice.title}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="text-xs text-slate-400">
                        {notice.source}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${badge.cls}`}
                      >
                        {badge.text}
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onDelete(notice.id)}
                    aria-label="删除这条通知"
                    className="px-2.5 text-lg leading-none text-slate-300 transition hover:text-red-500"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}