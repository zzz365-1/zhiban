"use client";

import { useEffect, useState } from "react";

/**
 * 多通知切分确认弹窗。
 *
 * 【为什么做成弹窗】以前切分预览和结果就贴在输入框下面，
 * 输入框被挤成一条，用户根本看不全自己粘的原文。
 * 提示类的东西不该抢输入框的位置，所以一律弹窗。
 *
 * 两种形态：
 *   1. 切出来了：列出每一块，可以去掉误切的，确认后才解析
 *   2. 切不出来：告诉用户没认出分隔，说明该怎么分隔，
 *      并提供「当作一条通知解析」的退路
 */
export default function MultiSplitDialog({
  open,
  items,
  reason,
  onConfirm,
  onCancel,
  onParseAsSingle,
}) {
  const [removed, setRemoved] = useState([]);

  // 点遮罩和按 Esc 都能关，不然弹窗挡着没法回去改原文。
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const kept = items.filter((_, idx) => removed.indexOf(idx) === -1);
  const failed = Boolean(reason);

  function toggle(idx) {
    setRemoved((prev) =>
      prev.indexOf(idx) === -1 ? [...prev, idx] : prev.filter((x) => x !== idx)
    );
  }

  function preview(t) {
    const lines = String(t || "").split(String.fromCharCode(10));
    for (const line of lines) {
      const s = line.trim();
      if (s) return s.length > 34 ? s.slice(0, 34) + "…" : s;
    }
    return "（空）";
  }

  function body(t) {
    const lines = String(t || "").split(String.fromCharCode(10));
    const first = lines.findIndex((l) => l.trim() !== "");
    const rest = lines.slice(first + 1).join(" ").trim();
    if (!rest) return "";
    return rest.length > 60 ? rest.slice(0, 60) + "…" : rest;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onCancel}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-none border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            {failed ? "没认出这是多条通知" : "识别到 " + items.length + " 条通知"}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {failed
              ? "这段内容既没有空行，也找不出第二个通知标题，程序不敢乱切。"
              : "确认分法没问题就点解析，认错的那一块可以先去掉。"}
          </p>
        </div>

        {failed ? (
          <div className="flex-none px-5 py-4">
            <div className="rounded-xl bg-amber-50 p-4">
              <p className="text-xs font-medium text-amber-800">
                {reason || "无法可靠分割"}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-amber-700">
                请这样分隔：两条通知之间空一行，或者每条都以「关于……的通知」
                这种标题开头。改完再点一次解析。
              </p>
            </div>
          </div>
        ) : (
          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-4">
            {items.map((t, idx) => {
              const off = removed.indexOf(idx) !== -1;
              return (
                <li
                  key={idx}
                  className={`rounded-xl border p-3 transition ${
                    off
                      ? "border-slate-100 bg-slate-50 opacity-50"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex-none text-[11px] font-medium text-slate-400">
                      第 {idx + 1} 条
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug text-slate-800">
                        {preview(t)}
                      </p>
                      {body(t) && (
                        <p className="mt-1 text-xs leading-snug text-slate-500">
                          {body(t)}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => toggle(idx)}
                      className="flex-none rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-500 transition hover:bg-slate-50"
                    >
                      {off ? "加回来" : "去掉"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-none justify-end gap-3 border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
          >
            {failed ? "返回修改" : "取消"}
          </button>
          {failed ? (
            <button
              type="button"
              onClick={onParseAsSingle}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              当作一条通知解析
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onConfirm(kept)}
              disabled={kept.length === 0}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                kept.length === 0
                  ? "cursor-not-allowed bg-slate-100 text-slate-400"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              解析这 {kept.length} 条
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
