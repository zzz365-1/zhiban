"use client";

/**
 * PatchHistory —— 通知的修改历史面板。
 *
 * 数据来自通知对象上的 history 数组，每条记录形如：
 *   {
 *     time: 1762000000000,                 // 毫秒时间戳
 *     summary: "……一句人话总结……",
 *     changes: [
 *       { field: "date", from: "11月8日", to: "11月9日", quote: "……依据原句……" }
 *     ],
 *     rawText: "……那次补充通知的整段原文……"
 *   }
 *
 * 设计要点：
 * 1. history 为空 / 未传时整块不渲染，连标题都不出现。
 * 2. 最新的一条排在最上面（同学最关心最近一次）。
 * 3. 明细里改前值加删除线、改后值深色，方向一眼可见。
 * 4. 英文键名统一翻成中文，未知键名直接原样显示，不硬编码兜底成错误文案。
 * 5. 原文默认收起，点开才展开，避免概览被整段原文淹没。
 */

import { useState } from "react";

// 字段键名 → 中文显示名。日期 / 时间 / 地点 / 材料 / 取消按约定翻译。
const FIELD_LABELS = {
  date: "日期",
  deadline: "日期",
  time: "时间",
  location: "地点",
  materials: "材料",
  cancel: "取消",
};

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}年${pad(d.getMonth() + 1)}月${pad(
    d.getDate()
  )}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fieldLabel(field) {
  return FIELD_LABELS[field] || field;
}

export default function PatchHistory({ history, onLocate }) {
  // 每条记录的展开状态，用时间戳当键。默认全部收起。
  const [expanded, setExpanded] = useState({});

  if (!Array.isArray(history) || history.length === 0) return null;

  // 最新的一条在最上面，不改原数组
  const records = [...history].sort((a, b) => (b.time || 0) - (a.time || 0));

  function toggle(index) {
    setExpanded((prev) => ({ ...prev, [index]: !prev[index] }));
  }

  return (
    <div className="border-t border-slate-100 pt-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          修改历史
        </h3>
        <span className="text-[10px] font-normal text-slate-400">
          共 {records.length} 条
        </span>
      </div>

      <ul className="space-y-3">
        {records.map((record, index) => {
          const changes = Array.isArray(record.changes) ? record.changes : [];
          const isOpen = Boolean(expanded[index]);

          return (
            <li
              key={record.time || index}
              className="rounded-lg border border-slate-200 bg-white p-3"
            >
              <p className="text-[11px] text-slate-400">
                {formatTime(record.time)}
              </p>
              {record.summary && (
                <p className="mt-1 text-sm text-slate-700">{record.summary}</p>
              )}

              {changes.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {changes.map((change, ci) => (
                    <li
                      key={ci}
                      className="flex items-start justify-between gap-2 text-xs leading-relaxed"
                    >
                      <span className="flex-1 text-slate-600">
                        <span className="font-medium text-slate-500">
                          {fieldLabel(change.field)}
                        </span>
                        {"：从 "}
                        <span className="text-slate-400 line-through">
                          {change.from || "（空）"}
                        </span>
                        {" 改为 "}
                        <span className="font-medium text-slate-800">
                          {change.to || "（空）"}
                        </span>
                      </span>
                      {change.quote && (
                        <button
                          type="button"
                          onClick={() => onLocate && onLocate(change.quote)}
                          title="定位到原文依据"
                          className="shrink-0 text-[11px] text-blue-600 underline decoration-dotted underline-offset-2 hover:text-blue-700"
                        >
                          依据原句
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {record.rawText && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => toggle(index)}
                    className="text-[10px] text-slate-400 hover:text-slate-600"
                  >
                    {isOpen ? "收起补充通知原文" : "查看当时的补充通知原文"}
                  </button>
                  {isOpen && (
                    <p className="mt-1.5 whitespace-pre-wrap rounded-md bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-600">
                      {record.rawText}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
