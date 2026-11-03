"use client";

import { useState } from "react";
import ItemsPanel from "./ItemsPanel";
import { parseUserDateInput } from "../lib/deadline.js";
import { getNoticeTitle } from "../lib/shareText.js";
import { shortParseErrorLabel, describeParseError } from "../lib/aiExtract.js";
import { findSpan } from "../lib/fieldLocate.js";

const FIELDS = [
  { key: "title", label: "标题", editable: true, full: true },
  { key: "deadline", label: "截止日期", editable: true, isDate: true },
  { key: "time", label: "具体时间", editable: true },
  // 一条通知里常常还有一个活动或者会议举办的日子，和要赶的截止日不是同一天。
  // 原来没有出口，举办日要么被当成截止日抢走，要么干脆没人管。
  // 没有活动的通知不该显示这两行，也不该显示未识别，所以空就整行不渲染。
  {
    key: "eventDate",
    label: "活动日期",
    editable: true,
    isDate: true,
    hideWhenEmpty: true,
  },
  {
    key: "eventTime",
    label: "活动时间",
    editable: true,
    hideWhenEmpty: true,
  },
  { key: "location", label: "地点", editable: true },
  {
    key: "materials",
    label: "需提交材料",
    editable: true,
    isMaterials: true,
    full: true,
  },
  { key: "audience", label: "面向对象", editable: true },
  { key: "summary", label: "摘要", ai: true, editable: false, full: true },
  { key: "category", label: "分类", ai: true, editable: false },
];

function getDisplayText(field, analysis, selectedNotice, draftText) {
  if (field.key === "title") {
    return getNoticeTitle({
      analysis,
      title: selectedNotice ? selectedNotice.title : null,
      text: selectedNotice ? selectedNotice.text : draftText,
    });
  }
  const v = analysis[field.key];
  // 摘要没有就是没有，不能跟抽取失败混用一个说法
  if (field.key === "summary") {
    return v || "暂无摘要";
  }
  // 分类不是从原文抄出来的值，没有分类是正常的，不能跟抽取失败混用一个说法
  const emptyLabel = field.key === "category" ? "未分类" : "未识别";
  if (Array.isArray(v)) {
    return v.length === 0 ? emptyLabel : v.join("、");
  }
  return v || emptyLabel;
}

function toDraft(field, analysis, selectedNotice, draftText) {
  if (field.key === "title") {
    return getDisplayText(field, analysis, selectedNotice, draftText);
  }
  if (field.isMaterials) {
    const v = analysis[field.key];
    return Array.isArray(v) ? v.join("、") : "";
  }
  const v = analysis[field.key];
  return v ? String(v) : "";
}

/**
 * 根据 analysis._source 返回顶部标签。
 *
 * 【为什么 rule_fallback 要显示具体原因】
 * 之前只显示“模型未接入，已退回本地”，用户分不清是超时、网络断、
 * 还是没配密钥。后来把错误码一路带到这里，根据 code 显示不同短标签，
 * 让用户一眼看出栽在哪一步。
 */
function getSourceInfo(analysis) {
  if (!analysis) return null;
  const source = analysis._source;
  if (source === "manual") {
    return { text: "手动修正", cls: "bg-green-50 text-green-700" };
  }
  if (source === "mixed") {
    return { text: "模型补充", cls: "bg-blue-50 text-blue-600" };
  }
  if (source === "rule_fallback") {
    return {
      text: shortParseErrorLabel(analysis._aiErrorCode),
      cls: "bg-amber-50 text-amber-700",
    };
  }
  return { text: "本地规则识别", cls: "bg-slate-100 text-slate-500" };
}

export default function AnalysisPanel({
  selectedNotice,
  analysis,
  draftText,
  onUpdate,
  onUpdateItem,
  onFieldClick,
}) {
  const [editingKey, setEditingKey] = useState(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [notFoundKey, setNotFoundKey] = useState(null);
  const [notFoundMsg, setNotFoundMsg] = useState("");

  const sourceInfo = getSourceInfo(analysis);

  // 只有 rule_fallback 才显示详细错误横幅。
  // 手动修正后 _source 变成 manual，横幅自然消失。
  const showErrorBanner =
    analysis && analysis._source === "rule_fallback" && analysis._aiErrorCode;

  function handleLocate(field, isEmpty) {
    setNotFoundKey(null);
    setNotFoundMsg("");
    if (isEmpty) return; // 空字段不高亮、不报错

    const span = findSpan(draftText, field, analysis);
    if (!span) {
      setNotFoundKey(field.key);
      setNotFoundMsg(
        field.key === "deadline" && analysis._inferredDeadline
          ? "这个日期是按今天换算出来的，原文里没有对应日期。"
          : "原文里没找到这段内容，请自行核对。"
      );
      return;
    }
    if (onFieldClick) onFieldClick(span);
  }

  function startEdit(field) {
    setEditingKey(field.key);
    setDraft(toDraft(field, analysis, selectedNotice, draftText));
    setError("");
  }

  function cancelEdit() {
    setEditingKey(null);
    setDraft("");
    setError("");
  }

  function saveEdit(field) {
      // 日期字段可能是截止日期也可能是活动日期，按字段自己的键写回，
      // 不能一律写成 deadline，否则编辑活动日期会把截止日期改掉。
      if (field.isDate) {
        const trimmed = draft.trim();
        if (trimmed === "") {
          onUpdate({ [field.key]: null });
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
        onUpdate({ [field.key]: parsed.normalized });
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

      <div className="flex-1 overflow-y-auto p-4">
        {!analysis && (
          <p className="text-sm leading-relaxed text-slate-400">
            {selectedNotice
              ? "这条通知还没有解析结果。"
              : "在上方粘贴原文后点击「解析」。"}
          </p>
        )}

        {analysis && (
          <div className="space-y-4">
            {showErrorBanner && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-800">
                  模型调用失败
                </p>
                <p className="mt-1 text-xs leading-relaxed text-amber-700">
                  {describeParseError(analysis._aiErrorCode)}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-amber-600">
                  以下结果来自本地规则，可能不完整。可以点「解析」重新试一次。
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {FIELDS.filter((field) => {
              if (!field.hideWhenEmpty) return true;
              const v = analysis[field.key];
              if (Array.isArray(v)) return v.length > 0;
              return Boolean(v);
            }).map((field) => {
              const isEditing = editingKey === field.key;
              const text = getDisplayText(
                field,
                analysis,
                selectedNotice,
                draftText
              );
              const isEmpty = text === "未识别" || text === "未分类";
              const showInferredHint =
                field.key === "deadline" &&
                analysis._inferredDeadline &&
                !isEmpty &&
                !isEditing;
              const showPendingDateHint =
                field.key === "deadline" &&
                Boolean(analysis._datePending) &&
                !isEditing;

              return (
                <div
                  key={field.key}
                  className={field.full ? "col-span-2" : ""}
                >
                  <div className="group mb-1 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold text-slate-500">
                        {field.label}
                      </p>
                      {field.ai && (
                        <span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-400">
                          AI
                        </span>
                      )}
                      {analysis._source === "ai" && field.editable && (
                        <span className="rounded bg-purple-50 px-1 py-0.5 text-[10px] font-medium text-purple-600">
                          推断
                        </span>
                      )}
                    </div>
                    {field.editable && !isEditing && (
                      <button
                        type="button"
                        onClick={() => startEdit(field)}
                        title="编辑"
                        aria-label="编辑"
                        className="text-slate-400 opacity-0 transition-opacity hover:text-blue-600 group-hover:opacity-100"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className="h-3.5 w-3.5"
                        >
                          <path d="M13.586 3.586a2 2 0 1 1 2.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793 3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                        </svg>
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
                        onClick={() => handleLocate(field, isEmpty)}
                        className={`min-h-[38px] rounded-lg border px-3 py-2 text-sm ${
                          isEmpty
                            ? "border-dashed border-slate-200 bg-white text-slate-400"
                            : "border-slate-200 bg-blue-50/40 text-slate-800 cursor-pointer hover:border-blue-300"
                        }`}
                      >
                        {text}
                      </div>
                      {notFoundKey === field.key && (
                        <p className="mt-1 text-[11px] leading-relaxed text-red-500">
                          {notFoundMsg}
                        </p>
                      )}
                      {showInferredHint && (
                        <p className="mt-1 text-[11px] leading-relaxed text-amber-600">
                          原文为相对日期，这里是模型按今天日期换算的结果，仅供参考。
                        </p>
                      )}
                      {showPendingDateHint && (
                        <p className="mt-1 text-[11px] leading-relaxed text-amber-600">
                          日期待确认，请补充发布日期以便换算。
                        </p>
                      )}
                    </>
                  )}
                </div>
              );
            })}
            <div className="border-t border-slate-100 pt-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                事项清单
              </h3>
              <ItemsPanel
                items={Array.isArray(analysis.items) ? analysis.items : []}
                onProgressChange={(index, nextProgress) => {
                  if (onUpdateItem) onUpdateItem(index, nextProgress);
                }}
                onLocate={onFieldClick}
                manual={analysis._source === "manual"}
              />
            </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}