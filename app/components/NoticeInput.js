"use client";

import { useRef, useEffect } from "react";
import MultiNoticePanel from "./MultiNoticePanel";

const MODES = [
  { key: "single", label: "单条通知" },
  { key: "multi", label: "多通知" },
];

export default function NoticeInput({
  value,
  onChange,
  onParse,
  onSave,
  canSave,
  saveLabel,
  mode,
  onModeChange,
  warning,
  onDismissWarning,
  onSwitchMode,
  onBatchSave,
  existingNotices,
}) {
  const textareaRef = useRef(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const max = mode === "multi" ? 180 : 1000;
    el.style.height = Math.min(el.scrollHeight, max) + "px";
  }, [value, mode]);

  return (
    <section className="flex h-full min-h-0 flex-col bg-slate-50/70 p-5">
      <div className="mb-3 flex w-fit items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => onModeChange(m.key)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition ${
              mode === m.key
                ? "bg-blue-50 text-blue-700"
                : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="mb-3 flex items-baseline justify-between">
        <label
          htmlFor="notice-text"
          className="text-sm font-semibold text-slate-700"
        >
          {mode === "single" ? "通知原文" : "多条通知原文"}
        </label>
        <span className="text-xs text-slate-400">
          {mode === "single"
            ? "粘贴一条通知"
            : "用空行或「关于……的通知」标题分隔多条"}
        </span>
      </div>

      {warning && warning.shouldWarn && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs leading-relaxed text-amber-800">
            {warning.message}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => onSwitchMode(warning.suggestedMode)}
              className="rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700"
            >
              切换到
              {warning.suggestedMode === "multi" ? "「多通知」" : "「单条通知」"}
            </button>
            <button
              type="button"
              onClick={onDismissWarning}
              className="rounded-md border border-amber-200 bg-white px-3 py-1 text-xs text-amber-700 hover:bg-amber-50"
            >
              保持当前模式
            </button>
          </div>
        </div>
      )}

      <textarea
        ref={textareaRef}
        id="notice-text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          mode === "single"
            ? "把一条通知的原文粘贴到这里……"
            : "把多条通知的原文粘贴到这里，用空行或「关于……的通知」标题分隔……"
        }
        rows={6}
        className="w-full resize-none overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-800 shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
      />

      {mode === "single" && (
        <>
          <div className="mt-4 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onParse}
              className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200"
            >
              解析
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={!canSave}
              className={`rounded-lg px-5 py-2.5 text-sm font-medium transition ${
                canSave
                  ? "bg-blue-600 text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200"
                  : "cursor-not-allowed bg-slate-100 text-slate-400"
              }`}
            >
              {saveLabel}
            </button>
          </div>
          <div className="flex-1" aria-hidden="true" />
        </>
      )}

      {mode === "multi" && (
        <div className="mt-4 min-h-0 flex-1">
          <MultiNoticePanel
            text={value}
            existingNotices={existingNotices}
            onSave={onBatchSave}
          />
        </div>
      )}
    </section>
  );
}