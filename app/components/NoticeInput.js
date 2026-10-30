"use client";

import { useRef, useEffect } from "react";

export default function NoticeInput({ value, onChange, onParse }) {
  const textareaRef = useRef(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <section className="flex h-full flex-col bg-slate-50/70 p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <label
          htmlFor="notice-text"
          className="text-sm font-semibold text-slate-700"
        >
          通知原文
        </label>
        <span className="text-xs text-slate-400">
          粘贴完整通知，或手动输入
        </span>
      </div>

      <textarea
        ref={textareaRef}
        id="notice-text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="把群聊、公众号或教务系统里的通知原文粘贴到这里……"
        rows={6}
        className="w-full resize-none rounded-xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-800 shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
      />

      <div className="mt-4 flex items-center justify-end">
        <button
          type="button"
          onClick={onParse}
          className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200"
        >
          解析
        </button>
      </div>

      <div className="flex-1" aria-hidden="true" />
    </section>
  );
}