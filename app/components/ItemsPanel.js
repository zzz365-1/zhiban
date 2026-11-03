"use client";

import { statusLabel } from "../lib/noticeItems.js";

const PROGRESS_OPTIONS = [
  { value: "待办理", label: "待办理" },
  { value: "已办理", label: "已办理" },
  { value: "无需办理", label: "无需办理" },
];

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

function FieldValue({ value, evidence, onLocate, status, emptyLabel }) {
  if (value === null || value === undefined || value === "") {
    return (
      <>
        <span className="text-slate-400">{emptyLabel || "—"}</span>
        <StatusTag status={status} />
      </>
    );
  }
  const text = Array.isArray(value) ? value.join("、") : String(value);
  if (evidence && typeof evidence.start === "number") {
    return (
      <>
        <button
          type="button"
          onClick={() => onLocate({ start: evidence.start, end: evidence.end })}
          className="text-left text-blue-700 underline decoration-dotted underline-offset-2 hover:text-blue-800"
          title="跳转到原文"
        >
          {text}
        </button>
        <StatusTag status={status} />
      </>
    );
  }
  return (
    <>
      <span>{text}</span>
      <StatusTag status={status} />
    </>
  );
}

export default function ItemsPanel({
  items,
  onProgressChange,
  onLocate,
  manual,
}) {
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
      {items.map((item, index) => {
        const fields = item.evidence?.fields || {};
        const status = item.status || {};
        return (
          <div
            key={index}
            className="rounded-lg border border-slate-200 bg-white p-3"
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-800">
                {item.name || "未命名事项"}
              </span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
                {item.timeTypeLabel}
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div className="flex">
                <dt className="w-16 shrink-0 text-slate-400">日期</dt>
                <dd className="min-w-0 flex-1">
                  <FieldValue
                    value={item.date}
                    evidence={fields.date}
                    onLocate={onLocate}
                    status={status.date}
                    emptyLabel="原文未提及"
                  />
                </dd>
              </div>
              <div className="flex">
                <dt className="w-16 shrink-0 text-slate-400">时间</dt>
                <dd className="min-w-0 flex-1">
                  <FieldValue
                    value={item.time}
                    evidence={fields.time}
                    onLocate={onLocate}
                    status={status.time}
                    emptyLabel="原文未提及"
                  />
                </dd>
              </div>
              <div className="flex">
                <dt className="w-16 shrink-0 text-slate-400">地点</dt>
                <dd className="min-w-0 flex-1">
                  <FieldValue
                    value={item.location}
                    evidence={fields.location}
                    onLocate={onLocate}
                    status={status.location}
                    emptyLabel="原文未提及"
                  />
                </dd>
              </div>
              <div className="flex">
                <dt className="w-16 shrink-0 text-slate-400">面向对象</dt>
                <dd className="min-w-0 flex-1">
                  <FieldValue
                    value={item.audience}
                    evidence={fields.audience}
                    onLocate={onLocate}
                    status={status.audience}
                    emptyLabel="原文未提及"
                  />
                </dd>
              </div>
              <div className="col-span-2 flex">
                <dt className="w-16 shrink-0 text-slate-400">材料</dt>
                <dd className="min-w-0 flex-1">
                  <FieldValue
                    value={item.materials}
                    evidence={fields.materials}
                    onLocate={onLocate}
                    status={status.materials}
                    emptyLabel="原文未提及"
                  />
                </dd>
              </div>
            </dl>

            <div className="mt-2 flex items-center gap-1">
              {PROGRESS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onProgressChange(index, opt.value)}
                  className={`rounded-md px-2 py-1 text-xs ${
                    item.progress === opt.value
                      ? "bg-blue-600 text-white"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
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
        );
      })}
    </div>
  );
}
