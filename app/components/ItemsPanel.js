"use client";

import { useState, useEffect, useRef } from "react";
import { statusLabel } from "../lib/noticeItems.js";

const PROGRESS_OPTIONS = [
  { value: "待办理", label: "待办理" },
  { value: "已办理", label: "已办理" },
  { value: "无需办理", label: "无需办理" },
];

// 字段状态里哪些要算作需要注意。
// 待确认是原文写了但缺发布日期算不出来，比如明天和下周三。
// 有问题是指算出来的值不合法，比如不是合法时刻。
// 原文压根没写的不算，那是原文未提及，不挂待确认。
function isAttentionStatus(s) {
  return s === "pending" || s === "failed";
}

function anyFieldNeedsAttention(item) {
  const status = item.status || {};
  return Object.keys(status).some((k) => isAttentionStatus(status[k]));
}

// 取某个字段的依据原句，只认字段级手动标记，没改过的字段照常显示
function fieldQuote(fields, key, manualFields) {
  if (manualFields && manualFields[key]) return "";
  const f = fields && fields[key];
  if (!f) return "";
  return f.quote || "";
}

function StatusTag({ status }) {
  const text = statusLabel(status);
  if (!text) return null;
  const cls =
    status === "failed"
      ? "bg-red-50 text-red-600"
      : status === "pending"
      ? "bg-amber-50 text-amber-600"
      : status === "not_applicable"
      ? "bg-slate-100 text-slate-400"
      : "bg-slate-100 text-slate-500";
  return (
    <span className={`ml-1 rounded px-1 py-0.5 text-[10px] ${cls}`}>
      {text}
    </span>
  );
}

function FieldLine({
  index,
  value,
  evidence,
  onLocate,
  status,
  emptyLabel,
  fieldKey,
  quote,
  onEditField,
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const empty = value === null || value === undefined || value === "";
  const text = empty
    ? emptyLabel || "原文未提及"
    : Array.isArray(value)
    ? value.join("、")
    : String(value);

  const hasSpan = !empty && evidence && typeof evidence.start === "number";

  function handleTextClick() {
    if (hasSpan && onLocate) {
      onLocate({ start: evidence.start, end: evidence.end });
      if (quote) setExpanded((e) => !e);
    }
  }

  function startEdit() {
    setEditing(true);
    setDraft(empty ? "" : text);
  }

  function cancelEdit() {
    setEditing(false);
    setDraft("");
  }

  function commitEdit() {
    const next = draft.trim();
    if (onEditField) onEditField(index, fieldKey, next === "" ? null : next);
    setEditing(false);
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          type="text"
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitEdit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancelEdit();
            }
          }}
          className="w-40 rounded border border-blue-300 px-1.5 py-0.5 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
        <button
          type="button"
          onClick={commitEdit}
          title="保存"
          aria-label="保存"
          className="text-green-600 hover:text-green-700"
        >
          ✓
        </button>
        <button
          type="button"
          onClick={cancelEdit}
          title="取消"
          aria-label="取消"
          className="text-slate-400 hover:text-slate-600"
        >
          ×
        </button>
      </span>
    );
  }

  return (
    <>
      <span
        onClick={handleTextClick}
        className={
          hasSpan
            ? "cursor-pointer underline decoration-dotted underline-offset-2 hover:opacity-80"
            : empty
            ? "text-slate-400"
            : ""
        }
        title={hasSpan ? "跳转到原文" : undefined}
      >
        {text}
      </span>
      <StatusTag status={status} />
      {onEditField && (
        <button
          type="button"
          onClick={startEdit}
          className="ml-1 text-[10px] text-blue-500 hover:text-blue-700"
        >
          修改
        </button>
      )}
      {expanded && quote && (
        <div className="mt-1 rounded bg-slate-50 px-1.5 py-1 text-[11px] leading-relaxed text-slate-500">
          依据：{quote}
        </div>
      )}
    </>
  );
}

function TimeHeadline({
  index,
  item,
  fields,
  status,
  onLocate,
  onEditField,
  manualFields,
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const parts = [];
  if (item.timeTypeLabel) parts.push(item.timeTypeLabel);
  if (item.date) parts.push(item.date);
  if (item.time) parts.push(item.time);

  const span =
    (fields.date && typeof fields.date.start === "number" && fields.date) ||
    (fields.time && typeof fields.time.start === "number" && fields.time) ||
    null;

  const quote =
    fieldQuote(fields, "date", manualFields) ||
    fieldQuote(fields, "time", manualFields);

  const text = parts.join(" ");
  const tagStatus =
    item.date || item.time
      ? status.date === "failed" || status.time === "failed"
        ? "failed"
        : status.date === "pending" || status.time === "pending"
        ? "pending"
        : null
      : status.date || status.time;

  function handleTextClick() {
    if (span && onLocate) {
      onLocate({ start: span.start, end: span.end });
      if (quote) setExpanded((e) => !e);
    }
  }

  function commitEdit() {
    const next = draft.trim();
    if (onEditField && next !== "") onEditField(index, "date", next);
    setEditing(false);
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          type="text"
          value={draft}
          autoFocus
          placeholder="如 2026年11月6日"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitEdit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            }
          }}
          className="w-44 rounded border border-blue-300 px-1.5 py-0.5 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
        <button
          type="button"
          onClick={commitEdit}
          title="保存"
          aria-label="保存"
          className="text-green-600 hover:text-green-700"
        >
          ✓
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          title="取消"
          aria-label="取消"
          className="text-slate-400 hover:text-slate-600"
        >
          ×
        </button>
      </span>
    );
  }

  if (parts.length === 0) {
    return (
      <>
        <span className="text-slate-400">原文未提及</span>
        <StatusTag status={status.date || status.time} />
      </>
    );
  }

  return (
    <>
      <span
        onClick={handleTextClick}
        className={
          span
            ? "cursor-pointer underline decoration-dotted underline-offset-2 hover:opacity-80"
            : ""
        }
        title={span ? "跳转到原文" : undefined}
      >
        {text}
      </span>
      <StatusTag status={tagStatus} />
      {onEditField && (
        <button
          type="button"
          onClick={() => {
            setEditing(true);
            setDraft(item.date ? String(item.date) : "");
          }}
          className="ml-1 text-[10px] text-blue-500 hover:text-blue-700"
        >
          修改
        </button>
      )}
      {expanded && quote && (
        <div className="mt-1 rounded bg-slate-50 px-1.5 py-1 text-[11px] leading-relaxed text-slate-500">
          依据：{quote}
        </div>
      )}
    </>
  );
}

function locationHeadline(item, fields, status, onLocate) {
  if (item.location) {
    return {
      text: item.location,
      empty: false,
      evidence: fields.location,
      status: status.location,
    };
  }
  // 没地点，退到“办理入口”类说法
  const entry =
    (Array.isArray(item.materials) && item.materials.length > 0
      ? "见通知说明的办理入口"
      : null) || "原文未提及办理入口";
  return { text: entry, empty: true, evidence: null, status: status.location };
}

function MaterialChecklist({ materials, onChange, justReadyKey, index }) {
  return (
    <ul className="mt-1 space-y-1">
      {materials.map((m, i) => {
        const checked = Boolean(m && m.ready);
        const key = String(index) + "-" + String(i);
        return (
          <li key={i}>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(i, e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-200"
              />
              <span className={checked ? "text-slate-400 line-through" : ""}>
                {m && m.name ? m.name : "未命名材料"}
              </span>
              {justReadyKey === key && (
                <span className="zb-fade-in text-[11px] text-green-600">
                  已准备
                </span>
              )}
            </label>
          </li>
        );
      })}
    </ul>
  );
}

export default function ItemsPanel({
  items,
  onProgressChange,
  onLocate,
  manual,
  onMaterialToggle,
  onCompleteToggle,
  onEditField,
}) {
  // 最近一次刚被勾上的材料标识，事项序号加材料序号，用于短暂显示已准备
  const [justReadyKey, setJustReadyKey] = useState(null);
  const readyTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    };
  }, []);

  function flashReady(key) {
    if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    setJustReadyKey(key);
    readyTimerRef.current = setTimeout(() => {
      setJustReadyKey(null);
      readyTimerRef.current = null;
    }, 1200);
  }

  if (!items || items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-400">
        这条通知里没有拆出具体事项。
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {manual && <p className="text-[11px] text-green-600">事项已手动调整。</p>}
      <div className="relative">
        {/* 左侧竖线：串起所有卡片，不画箭头 */}
        <div className="absolute left-[5px] top-1 bottom-1 w-px bg-slate-200" />
        <ul className="space-y-3">
          {items.map((item, index) => {
            const fields = item.evidence?.fields || {};
            const status = item.status || {};
            const materials = Array.isArray(item.materials) ? item.materials : [];
            const suggestions = Array.isArray(item.suggestions)
              ? item.suggestions
              : [];
            const hasMaterials = materials.length > 0;
            const progress = item.progress || "待办理";
            const done = progress === "已办理";

            const loc = locationHeadline(item, fields, status, onLocate);

            return (
              <li
                key={index}
                className="zb-enter relative pl-5"
                style={{ animationDelay: Math.min(index, 4) * 80 + "ms" }}
              >
                {/* 节点圆点 */}
                <span className="absolute left-0 top-2 h-2.5 w-2.5 rounded-full border-2 border-white bg-blue-500 shadow ring-1 ring-blue-200" />

                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  {/* 第一显眼：事项名称 */}
                  <h3 className="text-base font-semibold leading-snug text-slate-900">
                    {item.name || "未命名事项"}
                    {anyFieldNeedsAttention(item) && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 align-middle text-[10px] font-medium text-amber-700">
                        待确认
                      </span>
                    )}
                  </h3>

                  {/* 第二显眼：时间行 */}
                  <p className="mt-1 text-sm font-medium text-blue-700">
                    <TimeHeadline
                      index={index}
                      item={item}
                      fields={fields}
                      status={status}
                      onLocate={onLocate}
                      onEditField={onEditField}
                      manualFields={item._manualFields}
                    />
                  </p>

                  {/* 地点行 */}
                  <p className="mt-1 text-xs text-slate-600">
                    <span className="mr-1 text-slate-400">地点</span>
                    <FieldLine
                      index={index}
                      value={loc.empty ? null : loc.text}
                      evidence={loc.evidence}
                      onLocate={onLocate}
                      status={loc.status}
                      emptyLabel={loc.text}
                      fieldKey="location"
                      quote={fieldQuote(fields, "location", item._manualFields)}
                      onEditField={onEditField}
                    />
                  </p>

                  {/* 材料区：通知里要求的 */}
                  <div className="mt-2 border-t border-slate-100 pt-2">
                    <p className="text-[11px] font-medium text-slate-500">
                      通知要求
                    </p>
                    {hasMaterials ? (
                      <MaterialChecklist
                        materials={materials}
                        onChange={(mi, ready) => {
                          if (onMaterialToggle) onMaterialToggle(index, mi, ready);
                          const key = String(index) + "-" + String(mi);
                          if (ready) flashReady(key);
                          else if (justReadyKey === key) setJustReadyKey(null);
                        }}
                        justReadyKey={justReadyKey}
                        index={index}
                      />
                    ) : (
                      <p className="mt-1 text-xs text-slate-400">
                        这类事不用交材料
                        <StatusTag status={status.materials} />
                      </p>
                    )}
                  </div>

                  {/* 建议区：系统建议，不是通知要求 */}
                  {suggestions.length > 0 && (
                    <div className="mt-3 rounded-md bg-slate-50 p-2">
                      <p className="text-[11px] font-semibold text-slate-500">
                        系统建议不是通知里的要求
                      </p>
                      <ul className="mt-1 space-y-1">
                        {suggestions.map((s, si) => (
                          <li
                            key={si}
                            className="flex items-start gap-1.5 text-xs text-slate-600"
                          >
                            <span className="mt-0.5 shrink-0 rounded bg-amber-50 px-1 py-0.5 text-[10px] text-amber-600">
                              系统建议
                            </span>
                            <span>{typeof s === "string" ? s : s && s.text}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 办理状态：主按钮完成/撤销，附无需办理入口 */}
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (onCompleteToggle) {
                          onCompleteToggle(index, done ? "待办理" : "已办理");
                        } else if (onProgressChange) {
                          onProgressChange(index, done ? "待办理" : "已办理");
                        }
                      }}
                      className={`rounded-md px-3 py-1 text-xs font-medium ${
                        done
                          ? "bg-green-600 text-white hover:bg-green-700"
                          : "bg-blue-600 text-white hover:bg-blue-700"
                      }`}
                    >
                      {done ? "撤销完成" : "标记完成"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next =
                          progress === "无需办理" ? "待办理" : "无需办理";
                        if (onCompleteToggle) onCompleteToggle(index, next);
                        else if (onProgressChange) onProgressChange(index, next);
                      }}
                      className={`rounded-md px-2 py-1 text-[11px] ${
                        progress === "无需办理"
                          ? "border border-slate-300 bg-slate-100 text-slate-600"
                          : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      {progress === "无需办理" ? "取消无需办理" : "无需办理"}
                    </button>
                  </div>

                  {Array.isArray(item._issues) && item._issues.length > 0 && (
                    <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] text-amber-600">
                      {item._issues.map((issue, i) => (
                        <li key={i}>
                          {typeof issue === "string" ? issue : issue.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
