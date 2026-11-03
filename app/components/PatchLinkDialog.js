"use client";

// PatchLinkDialog：补充通知关联原通知的弹窗。
// 列出已有通知供同学自己挑选（不做自动关联），
// 顶部醒目展示歧义，匹配不到具体事项时允许手选事项。
import { useEffect, useState } from "react";
import { matchPatchTarget } from "../lib/noticePatch.js";

const FIELD_LABEL = {
  date: "日期",
  time: "时间",
  location: "地点",
  materials: "材料",
  cancel: "取消",
};

export default function PatchLinkDialog({
  notices,
  patchResult,
  onCancel,
  onNext,
}) {
  const [selectedId, setSelectedId] = useState(null);
  const [pickedIndexes, setPickedIndexes] = useState([]);
  // 当前选中通知自己的匹配结果，每条通知算一次，不用外面传进来的统一标记
  const [matchInfo, setMatchInfo] = useState({ indexes: [], needPick: false });

  const ambiguities =
    patchResult && Array.isArray(patchResult.ambiguities)
      ? patchResult.ambiguities
      : [];

  const selectedNotice = notices.find((n) => n.id === selectedId) ?? null;
  const selectedItems = selectedNotice
    ? selectedNotice.analysis?.items || selectedNotice.items || []
    : [];

  // 选中通知变化时，用这条通知自己的事项重算匹配结果
  useEffect(() => {
    if (!selectedNotice || !patchResult) {
      setMatchInfo({ indexes: [], needPick: false });
      setPickedIndexes([]);
      return;
    }
    const items = selectedNotice.analysis?.items || selectedNotice.items || [];
    const m = matchPatchTarget(items, patchResult) || {};
    const indexes = Array.isArray(m.indexes) ? m.indexes : [];
    const needPick = Boolean(m.needPick);
    setMatchInfo({ indexes, needPick });
    setPickedIndexes(needPick ? indexes.slice() : []);
  }, [selectedId, patchResult]);

  function handlePickNotice(id) {
    setSelectedId(id);
  }

  function handleToggleItem(index) {
    setPickedIndexes((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  }

  const canNext =
    Boolean(selectedId) && (!matchInfo.needPick || pickedIndexes.length > 0);

  function handleNext() {
    if (!canNext) return;
    const indexes = matchInfo.needPick ? pickedIndexes : matchInfo.indexes;
    onNext(selectedId, indexes);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
        <h2 className="text-base font-semibold text-slate-800">
          这是一条补充通知
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          请选择它要修改的原通知。系统不会自动关联，需要你自己确认。
        </p>

        {ambiguities.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
            <p className="text-xs font-semibold text-amber-800">
              歧义：请先确认这些再决定
            </p>
            <ul className="mt-1 list-disc pl-4 text-xs leading-relaxed text-amber-700">
              {ambiguities.map((a, i) => (
                <li key={i}>{typeof a === "string" ? a : a?.message || JSON.stringify(a)}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-3 max-h-56 space-y-1.5 overflow-y-auto pr-1">
          {notices.length === 0 && (
            <p className="py-4 text-center text-xs text-slate-400">暂无已保存的通知</p>
          )}
          {notices.map((n) => {
            const itemCount = (n.analysis?.items || n.items || []).length;
            const active = n.id === selectedId;
            return (
              <button
                type="button"
                key={n.id}
                onClick={() => handlePickNotice(n.id)}
                className={
                  "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition " +
                  (active
                    ? "border-blue-500 bg-blue-50 ring-1 ring-blue-400"
                    : "border-slate-200 bg-white hover:bg-slate-50")
                }
              >
                <span
                  className={
                    "truncate text-sm " +
                    (active ? "font-medium text-blue-700" : "text-slate-700")
                  }
                >
                  {n.title || "未命名通知"}
                </span>
                <span className="ml-2 shrink-0 text-xs text-slate-400">
                  {itemCount} 个事项
                </span>
              </button>
            );
          })}
        </div>

        {matchInfo.needPick && selectedNotice && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs font-medium text-slate-600">
              这条通知里没匹配到唯一的事项，请勾选要改的事项（至少一项）
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {selectedItems.map((item, index) => {
                const checked = pickedIndexes.includes(index);
                return (
                  <label
                    key={index}
                    className={
                      "flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs " +
                      (checked
                        ? "border-blue-500 bg-blue-100 text-blue-700"
                        : "border-slate-200 bg-white text-slate-600")
                    }
                  >
                    <input
                      type="checkbox"
                      className="h-3 w-3"
                      checked={checked}
                      onChange={() => handleToggleItem(index)}
                    />
                    <span>{item.name || item.itemName || "事项 " + (index + 1)}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={!canNext}
            className={
              "rounded-md px-3 py-1.5 text-xs font-medium text-white " +
              (canNext
                ? "bg-blue-600 hover:bg-blue-700"
                : "cursor-not-allowed bg-slate-300")
            }
          >
            下一步
          </button>
        </div>
      </div>
    </div>
  );
}
