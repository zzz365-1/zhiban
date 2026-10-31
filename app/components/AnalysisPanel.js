"use client";

import { useState } from "react";
import { parseUserDateInput } from "../lib/deadline";

const FIELDS = [
  { key: "title", label: "标题", editable: true },
  { key: "deadline", label: "截止日期", editable: true, isDate: true },
  { key: "time", label: "具体时间", editable: true },
  { key: "location", label: "地点", editable: true },
  { key: "materials", label: "需提交材料", editable: true, isMaterials: true },
  { key: "audience", label: "面向对象", editable: true },
  { key: "summary", label: "摘要", ai: true, editable: false },
  { key: "category", label: "分类", ai: true, editable: false },
];

function renderValue(value) {
  if (Array.isArray(value)) {
    return value.length === 0 ? "未识别" : value.join("、");
  }
  return value || "未识别";
}

function toDraft(field, analysis) {
  const v = analysis[field.key];
  if (field.isMaterials) {
    return Array.isArray(v) ? v.join("、") : "";
  }
  return v ? String(v) : "";
}

function getSourceInfo(source) {
  if (source === "manual") {
    return { text: "手动修正", cls: "bg-green-50 text-green-700" };
  }
  if (source === "mixed") {
    return { text: "模型补充", cls: "bg-blue-50 text-blue-600" };
  }
  if (source === "rule_fallback") {
    return {
      text: "模型未接入，已退回本地",
      cls: "bg-amber-50 text-amber-700",
    };
  }
  return { text: "本地规则识别", cls: "bg-slate-100 text-slate-500" };
}

export default function AnalysisPanel({ selectedNotice, analysis, onUpdate }) {
  const [editingKey, setEditingKey] = useState(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  const sourceInfo = analysis ? getSourceInfo(analysis._source) : null;

  function startEdit(field) {
    setEditingKey(field.key);
    setDraft(toDraft(field, analysis));
    setError("");
  }

  function cancelEdit() {
    setEditingKey(null);
    setDraft("");
    setError("");
  }

  function saveEdit(field) {
    if (field.isDate) {
      const trimmed = draft.trim();
      if (trimmed === "") {
        onUpdate({ deadline: null });
        cancelEdit();
        return;
      }
      const parsed = parseUserDateInput(trimmed);
      if (!parsed) {
        setError(
          "无法识别这个日期，请用 11月6日、2026-11-06 或 11/6 的写法。"
        );
        return;
      }
      onUpdate({ deadline: parsed.normalized });
      cancelEdit();
      return;
    }

    if (field.isMaterials) {
      const items = draft
        .split(new RegExp("[、,，]"))
        .map((s) => s.trim())
        .filter(Boolean);
      onUpdate({ materials: items });
      cancelEdit();
      return;
    }

    const value = draft.trim();
    onUpdate({ [field.key]: value || null });
    cancelEdit();
  }

  return (
    <aside className="flex h-full flex-col border-l border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          解析结果
        </h2>
        {sourceInfo && (
          <span
            className={`rounded px-2 py-0.5 text-[11px] font-medium ${sourceInfo.cls}`}
          >
            {sourceInfo.text}
          </span>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {!analysis && (
          <p className="text-sm leading-relaxed text-slate-400">
            {selectedNotice
              ? "这条通知还没有解析结果。"
              : "在左侧选择一条通知，或直接在中间粘贴原文后点击「解析」。"}
          </p>
        )}

        {analysis && (
          <>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-medium text-slate-400">当前通知</p>
              <p className="mt-1 text-sm font-medium leading-snug text-slate-800">
                {analysis.title ||
                  (selectedNotice ? selectedNotice.title : "手动输入的通知")}
              </p>
            </div>

            {FIELDS.map((field) => {
              const isEditing = editingKey === field.key;
              const text = renderValue(analysis[field.key]);
              const isEmpty = text === "未识别";
              const showInferredHint =
                field.key === "deadline" &&
                analysis._inferredDeadline &&
                !isEmpty &&
                !isEditing;

              return (
                <div key={field.key}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold text-slate-500">
                        {field.label}
                      </p>
                      {field.ai && (
                        <span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-400">
                          AI
                        </span>
                      )}
                    </div>
                    {field.editable && !isEditing && (
                      <button
                        type="button"
                        onClick={() => startEdit(field)}
                        className="text-[11px] text-blue-500 hover:text-blue-700"
                      >
                        编辑
                      </button>
                    )}
                  </div>

                  {isEditing ? (
                    <div>
                      <input
                        type="text"
                        value={draft}
                        onChange={(e) => {
                          setDraft(e.target.value);
                          setError("");
                        }}
                        autoFocus
                        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${
                          error
                            ? "border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100"
                            : "border-blue-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        }`}
                      />
                      {error && (
                        <p className="mt-1 text-[11px] text-red-500">
                          {error}
                        </p>
                      )}
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => saveEdit(field)}
                          className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div
                        className={`min-h-[44px] rounded-lg border px-3 py-2.5 text-sm ${
                          isEmpty
                            ? "border-dashed border-slate-200 bg-white text-slate-400"
                            : "border-slate-200 bg-blue-50/40 text-slate-800"
                        }`}
                      >
                        {text}
                      </div>
                      {showInferredHint && (
                        <p className="mt-1 text-[11px] leading-relaxed text-amber-600">
                          原文为相对日期，这里是模型按今天日期换算的结果，仅供参考。
                        </p>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </aside>
  );
}