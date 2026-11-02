"use client";

import { useState } from "react";

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
  showEmptyState,
  onLoadSamples,
}) {
  const [dismissedEmpty, setDismissedEmpty] = useState(false);

  const renderEmptyState =
    mode === "single" && showEmptyState && !dismissedEmpty && !value.trim();

  return (
    <section className="relative flex h-full min-h-0 flex-col p-5">
      {renderEmptyState && (
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
      )}

      {renderEmptyState && (
        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h3 className="text-lg font-semibold text-slate-800">
            欢迎使用知办
          </h3>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-500">
            知办可以从校园通知里自动提取截止日期、地点和要提交的材料，帮你把散落在群聊、公众号和教务系统里的通知整理成待办清单。
          </p>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
            把一条通知的原文粘贴到下方输入框，点「解析」就能看到结果。也可以先载入几条示例看看效果。
          </p>
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={onLoadSamples}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200"
            >
              载入示例通知
            </button>
            <button
              type="button"
              onClick={() => setDismissedEmpty(true)}
              className="rounded-lg border border-slate-200 bg-white px-5 py-2 text-sm text-slate-600 shadow-sm transition hover:bg-slate-50"
            >
              直接粘贴
            </button>
          </div>
          <p className="mt-4 text-xs text-slate-400">
            示例通知的日期按今天动态生成，不会过期。
          </p>
        </div>
      )}

      {!renderEmptyState && (
        <>
          <div className="mb-2 flex flex-none items-center justify-between gap-3">
            <div className="flex w-fit items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
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
            <label
              htmlFor="notice-text"
              className="text-sm font-semibold text-slate-700"
            >
              {mode === "single" ? "通知原文" : "多条通知原文"}
            </label>
          </div>

          <textarea
            id="notice-text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={
              mode === "single"
                ? "把一条通知的原文粘贴到这里……"
                : "把多条通知的原文粘贴到这里，用空行或「关于……的通知」标题分隔……"
            }
            rows={6}
            className="min-h-[160px] w-full flex-1 resize-none overflow-y-auto rounded-xl border border-slate-200 bg-white/90 p-4 text-sm leading-relaxed text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
          />
        </>
      )}

      {/* 两个模式共用同一排按钮。
          多通知以前只有一个开始解析，下半区还塞了一块预览面板把输入框压扁。
          现在预览改成弹窗，按钮和单条保持一致。 */}
      {!renderEmptyState && (
        <div className="mt-4 flex flex-none items-center justify-end gap-3">
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
      )}
      {/* 模式建议做成浮层，不进 flex 流。
          以前它是内联卡片，一出现就把输入框挤成一条缝，
          输入框是 flex-1 加 min-h-0，被挤到几十像素也不报错，看着就像坏了。 */}
      {warning && warning.shouldWarn && (
        <div className="absolute bottom-20 right-5 z-30 w-80 rounded-xl border border-amber-200 bg-amber-50 p-3 shadow-lg">
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
    </section>
  );
}