"use client";

import { useState } from "react";
import { splitNotices, isDuplicate } from "../lib/splitNotices";
import { parseOne } from "../lib/parseOne";

const STATUS_LABEL = {
  pending: "待解析",
  success: "已解析",
  fallback: "规则兜底（模型不可用）",
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

function previewText(text) {
  const t = text.trim();
  return t.length > 80 ? t.slice(0, 80) + "…" : t;
}

export default function BatchDialog({ existingNotices, onSave, onClose }) {
  const [phase, setPhase] = useState("input");
  const [rawText, setRawText] = useState("");
  const [splitError, setSplitError] = useState("");
  const [items, setItems] = useState([]);
  const [method, setMethod] = useState("");
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [summary, setSummary] = useState(null);

  function handleSplit() {
    setSplitError("");
    const result = splitNotices(rawText);
    if (!result.ok) {
      setSplitError(result.reason);
      return;
    }
    const enriched = result.items.map((text) => ({
      text,
      isDuplicate: isDuplicate(text, existingNotices),
      status: "pending",
      analysis: null,
      errorMsg: "",
    }));
    setItems(enriched);
    setMethod(result.method);
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
          (it.status === "success" || it.status === "fallback") &&
          it.analysis
      )
      .map((it) => ({ text: it.text, analysis: it.analysis }));
    onSave(toSave);
  }

  function handleBack() {
    setPhase("input");
    setItems([]);
    setSummary(null);
    setSplitError("");
  }

  const canClose = phase !== "parsing";
  const savable =
    items.filter(
      (it) =>
        (it.status === "success" || it.status === "fallback") && it.analysis
    ).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={canClose ? onClose : undefined}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-none items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="text-base font-semibold text-slate-800">批量粘贴</h3>
          {canClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-xl leading-none text-slate-300 hover:text-slate-500"
              aria-label="关闭"
            >
              ×
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {phase === "input" && (
            <>
              <p className="mb-2 text-xs text-slate-500">
                把整段文字粘进来，程序会按空行或“关于……的通知”标题自动分割。
              </p>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="粘贴包含多条通知的原文……"
                rows={12}
                className="w-full resize-none rounded-lg border border-slate-200 p-3 text-sm leading-relaxed outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              {splitError && (
                <p className="mt-2 text-xs text-red-500">{splitError}</p>
              )}
            </>
          )}

          {(phase === "preview" || phase === "parsing" || phase === "done") && (
            <>
              {phase === "preview" && (
                <p className="mb-2 text-xs text-slate-500">
                  已按
                  {method === "blank-line"
                    ? "空行"
                    : method === "header"
                    ? "“关于……的通知”标题"
                    : "单条"}
                  分割出 {items.length} 条。确认无误后点“开始解析”。
                </p>
              )}

              {phase === "parsing" && (
                <p className="mb-2 text-sm text-blue-600">
                  正在解析第 {progress.current} 条，共 {progress.total} 条
                </p>
              )}

              {phase === "done" && summary && (
                <div className="mb-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                  成功 {summary.success} 条
                  {summary.fallback > 0 && (
                    <>，规则兜底 {summary.fallback} 条</>
                  )}
                  {summary.duplicate > 0 && (
                    <>，与已有重复 {summary.duplicate} 条</>
                  )}
                  {summary.error > 0 && <>，失败 {summary.error} 条</>}
                </div>
              )}

              <ul className="space-y-2">
                {items.map((it, idx) => (
                  <li
                    key={idx}
                    className="rounded-lg border border-slate-200 p-3"
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-500">
                        第 {idx + 1} 条
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_CLASS[it.status]}`}
                      >
                        {STATUS_LABEL[it.status]}
                      </span>
                    </div>
                    <p className="text-sm leading-snug text-slate-700">
                      {previewText(it.text)}
                    </p>
                    {it.errorMsg && (
                      <p className="mt-1 text-[11px] text-red-500">
                        {it.errorMsg}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="flex flex-none justify-end gap-2 border-t border-slate-100 px-5 py-3">
          {phase === "input" && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSplit}
                disabled={!rawText.trim()}
                className={`rounded-md px-4 py-2 text-sm font-medium ${
                  rawText.trim()
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "cursor-not-allowed bg-slate-100 text-slate-400"
                }`}
              >
                分割预览
              </button>
            </>
          )}

          {phase === "preview" && (
            <>
              <button
                type="button"
                onClick={handleBack}
                className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                返回修改
              </button>
              <button
                type="button"
                onClick={handleParseAll}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                开始解析
              </button>
            </>
          )}

          {phase === "parsing" && (
            <button
              type="button"
              disabled
              className="cursor-wait rounded-md bg-slate-100 px-4 py-2 text-sm text-slate-400"
            >
              解析中…
            </button>
          )}

          {phase === "done" && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                关闭
              </button>
              <button
                type="button"
                onClick={handleSaveAll}
                disabled={savable === 0}
                className={`rounded-md px-4 py-2 text-sm font-medium ${
                  savable > 0
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "cursor-not-allowed bg-slate-100 text-slate-400"
                }`}
              >
                {savable > 0 ? `保存 ${savable} 条` : "没有可保存的条目"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}