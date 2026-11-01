"use client";

import { useState, useEffect } from "react";
import { splitNotices, isDuplicate } from "../lib/splitNotices";
import { parseOne } from "../lib/parseOne";

const STATUS_LABEL = {
  pending: "待解析",
  success: "已解析",
  fallback: "规则兜底",
  duplicate: "与已有通知重复",
  error: "解析失败",
};

const STATUS_CLASS = {
  pending: "bg-slate-100 text-slate-500",
  success: "bg-green-50 text-green-700",
  fallback: "bg-amber-50 text-amber-700",
  duplicate: "bg-slate-100 text-slate-400",
  error: "bg-red-50 text-red-600",
};

function previewText(t) {
  const s = String(t || "").trim();
  return s.length > 60 ? s.slice(0, 60) + "…" : s;
}

export default function MultiNoticePanel({ text, existingNotices, onSave }) {
  const [phase, setPhase] = useState("idle");
  const [items, setItems] = useState([]);
  const [splitError, setSplitError] = useState("");
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [summary, setSummary] = useState(null);
  const [lastSplitText, setLastSplitText] = useState("");

  // 文本被修改后自动回到 idle，避免拿旧预览配新内容
  useEffect(() => {
    if (phase !== "idle" && text !== lastSplitText) {
      setPhase("idle");
      setItems([]);
      setSummary(null);
      setSplitError("");
    }
  }, [text, lastSplitText, phase]);

  function handleSplit() {
    setSplitError("");
    const result = splitNotices(text);
    if (!result.ok) {
      setSplitError(result.reason);
      return;
    }
    const enriched = result.items.map((t) => ({
      text: t,
      isDuplicate: isDuplicate(t, existingNotices),
      status: "pending",
      analysis: null,
      errorMsg: "",
    }));
    setItems(enriched);
    setLastSplitText(text);
    setPhase("preview");
  }

  async function handleParseAll() {
    setPhase("parsing");
    setProgress({ current: 0, total: items.length });

    const updated = items.map((it) => ({ ...it }));

    for (let i = 0; i < updated.length; i++) {
      setProgress({ current: i + 1, total: updated.length });

      if (updated[i].isDuplicate) {
        updated[i].status = "duplicate";
        setItems(updated.map((x) => ({ ...x })));
        continue;
      }

      try {
        const result = await parseOne(updated[i].text);
        const source = result.analysis._source;
        updated[i].status = source === "rule_fallback" ? "fallback" : "success";
        updated[i].analysis = result.analysis;
        updated[i].errorMsg = result.error || "";
      } catch (e) {
        updated[i].status = "error";
        updated[i].errorMsg = String(e?.message || e);
      }
      setItems(updated.map((x) => ({ ...x })));
    }

    const s = { success: 0, fallback: 0, duplicate: 0, error: 0 };
    for (const it of updated) {
      if (it.status === "success") s.success++;
      else if (it.status === "fallback") s.fallback++;
      else if (it.status === "duplicate") s.duplicate++;
      else if (it.status === "error") s.error++;
    }
    setSummary(s);
    setPhase("done");
  }

  function handleSaveAll() {
    const toSave = items
      .filter(
        (it) =>
          (it.status === "success" || it.status === "fallback") && it.analysis
      )
      .map((it) => ({ text: it.text, analysis: it.analysis }));
    onSave(toSave);
  }

  function handleReset() {
    setPhase("idle");
    setItems([]);
    setSummary(null);
    setSplitError("");
    setLastSplitText("");
  }

  const savable = items.filter(
    (it) =>
      (it.status === "success" || it.status === "fallback") && it.analysis
  ).length;

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-slate-200 bg-white">
      {phase === "idle" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-5">
          <p className="text-xs text-slate-500">
            粘贴多条通知后，点击下方按钮分割预览。
          </p>
          <button
            type="button"
            onClick={handleSplit}
            disabled={!text.trim()}
            className={`rounded-md px-4 py-1.5 text-xs font-medium transition ${
              text.trim()
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "cursor-not-allowed bg-slate-100 text-slate-400"
            }`}
          >
            分割预览
          </button>
          {splitError && (
            <p className="max-w-xs text-center text-xs text-red-500">
              {splitError}
            </p>
          )}
        </div>
      )}

      {(phase === "preview" || phase === "parsing" || phase === "done") && (
        <>
          <div className="flex flex-none items-center justify-between border-b border-slate-100 px-4 py-2">
            {phase === "preview" && (
              <span className="text-xs text-slate-500">
                已分割 {items.length} 条，确认后点「开始解析」
              </span>
            )}
            {phase === "parsing" && (
              <span className="text-xs text-blue-600">
                正在解析第 {progress.current} 条，共 {progress.total} 条
              </span>
            )}
            {phase === "done" && summary && (
              <span className="text-xs text-slate-600">
                成功 {summary.success}
                {summary.fallback > 0 && <>，规则兜底 {summary.fallback}</>}
                {summary.duplicate > 0 && <>，重复 {summary.duplicate}</>}
                {summary.error > 0 && <>，失败 {summary.error}</>}
              </span>
            )}
            {phase !== "parsing" && (
              <button
                type="button"
                onClick={handleReset}
                className="text-[11px] text-slate-400 hover:text-slate-600"
              >
                重新开始
              </button>
            )}
          </div>

          <ul className="flex-1 space-y-2 overflow-y-auto p-3">
            {items.map((it, idx) => (
              <li
                key={idx}
                className="rounded-lg border border-slate-200 p-2.5"
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-[11px] font-medium text-slate-500">
                    第 {idx + 1} 条
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_CLASS[it.status]}`}
                  >
                    {STATUS_LABEL[it.status]}
                  </span>
                </div>
                <p className="text-xs leading-snug text-slate-700">
                  {previewText(it.text)}
                </p>
                {it.errorMsg && (
                  <p className="mt-1 text-[10px] text-red-500">
                    {it.errorMsg}
                  </p>
                )}
              </li>
            ))}
          </ul>

          <div className="flex flex-none justify-end gap-2 border-t border-slate-100 px-4 py-2">
            {phase === "preview" && (
              <button
                type="button"
                onClick={handleParseAll}
                className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                开始解析
              </button>
            )}
            {phase === "parsing" && (
              <button
                type="button"
                disabled
                className="cursor-wait rounded-md bg-slate-100 px-4 py-1.5 text-xs text-slate-400"
              >
                解析中…
              </button>
            )}
            {phase === "done" && (
              <button
                type="button"
                onClick={handleSaveAll}
                disabled={savable === 0}
                className={`rounded-md px-4 py-1.5 text-xs font-medium transition ${
                  savable > 0
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "cursor-not-allowed bg-slate-100 text-slate-400"
                }`}
              >
                {savable > 0 ? `保存 ${savable} 条` : "没有可保存的条目"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}