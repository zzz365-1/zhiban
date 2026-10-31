"use client";

import { generateDeadlineICS } from "../lib/generateICS";
import { buildDeadlineDate } from "../lib/deadline";

const FIELDS = [
  { key: "deadline", label: "截止日期" },
  { key: "time", label: "具体时间" },
  { key: "location", label: "地点" },
  { key: "materials", label: "需提交材料" },
  { key: "audience", label: "面向对象" },
];

function renderValue(value) {
  if (Array.isArray(value)) {
    return value.length === 0 ? "未识别" : value.join("、");
  }
  return value || "未识别";
}

export default function AnalysisPanel({ selectedNotice, analysis }) {
  const canExport =
    Boolean(analysis) &&
    Boolean(analysis.deadline) &&
    buildDeadlineDate(analysis.deadline, analysis.time) !== null;

  function handleExport() {
    if (!canExport) return;
    const date = buildDeadlineDate(analysis.deadline, analysis.time);

    const title = selectedNotice
      ? selectedNotice.title
      : "通知截止提醒（知办）";

    const descriptionParts = [];
    if (analysis.location) descriptionParts.push("地点：" + analysis.location);
    if (analysis.materials && analysis.materials.length) {
      descriptionParts.push("材料：" + analysis.materials.join("、"));
    }
    if (analysis.audience) descriptionParts.push("对象：" + analysis.audience);

    const ics = generateDeadlineICS({
      title,
      deadlineDate: date,
      location: analysis.location || "",
      description: descriptionParts.join(String.fromCharCode(10)),
    });

    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "zhiban-deadline.ics";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <aside className="flex h-full flex-col border-l border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          解析结果
        </h2>
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
                {selectedNotice ? selectedNotice.title : "手动输入的通知"}
              </p>
            </div>

            {FIELDS.map((field) => {
              const text = renderValue(analysis[field.key]);
              const isEmpty = text === "未识别";
              return (
                <div key={field.key}>
                  <p className="mb-1.5 text-xs font-semibold text-slate-500">
                    {field.label}
                  </p>
                  <div
                    className={`min-h-[44px] rounded-lg border px-3 py-2.5 text-sm ${
                      isEmpty
                        ? "border-dashed border-slate-200 bg-white text-slate-400"
                        : "border-slate-200 bg-blue-50/40 text-slate-800"
                    }`}
                  >
                    {text}
                  </div>
                </div>
              );
            })}

            <div className="pt-2">
              <button
                type="button"
                onClick={handleExport}
                disabled={!canExport}
                className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                  canExport
                    ? "bg-blue-600 text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200"
                    : "cursor-not-allowed bg-slate-100 text-slate-400"
                }`}
              >
                {canExport ? "下载日历文件（.ics）" : "缺少可识别的截止日期"}
              </button>
              {canExport && (
                <p className="mt-2 text-center text-xs text-slate-400">
                  截止前一天自动提醒
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}