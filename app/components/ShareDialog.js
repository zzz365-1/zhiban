"use client";

import { useState } from "react";
import { buildShareText } from "../lib/shareText";

/**
 * 优先用 navigator.clipboard.writeText。
 * 失败或不可用时降级到 execCommand("copy")。
 * 都失败返回 false，由调用方提示用户手动复制。
 */
async function copyToClipboard(text) {
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    window.isSecureContext
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // 落到降级方案
    }
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
}

export default function ShareDialog({ notices, now, onClose }) {
  const [rangeDays, setRangeDays] = useState(3);
  const [status, setStatus] = useState("idle");
  const [text, setText] = useState(() => buildShareText(notices, now, 3));

  function handleRangeChange(days) {
    setRangeDays(days);
    setText(buildShareText(notices, now, days));
    setStatus("idle");
  }

  async function handleCopy() {
    const ok = await copyToClipboard(text);
    setStatus(ok ? "success" : "failed");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">
            整理成文字
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-xl leading-none text-slate-300 hover:text-slate-500"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <div className="mb-3 flex gap-2">
          <button
            type="button"
            onClick={() => handleRangeChange(3)}
            className={`rounded-md px-3 py-1.5 text-sm transition ${
              rangeDays === 3
                ? "bg-blue-600 text-white"
                : "border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            最近三天
          </button>
          <button
            type="button"
            onClick={() => handleRangeChange(7)}
            className={`rounded-md px-3 py-1.5 text-sm transition ${
              rangeDays === 7
                ? "bg-blue-600 text-white"
                : "border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            最近七天
          </button>
        </div>

        <textarea
          readOnly
          value={text}
          rows={10}
          className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-700"
        />

        {status === "success" && (
          <p className="mt-2 text-xs text-green-600">已复制到剪贴板。</p>
        )}
        {status === "failed" && (
          <p className="mt-2 text-xs text-red-500">
            自动复制失败，请在上面的文本框里全选后手动复制（Ctrl+C）。
          </p>
        )}

        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            关闭
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            复制到剪贴板
          </button>
        </div>
      </div>
    </div>
  );
}