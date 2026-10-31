"use client";

import { generateDeadlineICS } from "../lib/generateICS";
import { buildDeadlineDate } from "../lib/deadline";

const FIELDS = [
  { key: "deadline", label: "截止日期" },
  { key: "time", label: "具体时间" },
  { key: "location", label: "地点" },
  { key: "materials", label: "需提交材料" },
  { key: "audience", label: "面向对象" },
  { key: "summary", label: "摘要", ai: true },
  { key: "category", label: "分类", ai: true },
];

function renderValue(value) {
  if (Array.isArray(value)) {
    return value.length === 0 ? "未识别" : value.join("、");
  }
  return value || "未识别";
}

function getSourceInfo(source) {
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

export default function AnalysisPanel({ selectedNotice, analysis }) {
  const canExport =
    Boolean(analysis) &&
    Boolean(analysis.deadline) &&
    buildDeadlineDate(analysis.deadline, analysis.time) !== null;

  const sourceInfo = analysis ? getSourceInfo(analysis._source) : null;

  function handleExport() {
    if (!canExport) return;
    const date = buildDeadlineDate(analysis.deadline, analysis.time);

    const title = selectedNotice
      ? selectedNotice.title
      : analysis.title || "通知截止提醒（知办）";

    // 摘要不进日历：模型生成的摘要可能出错，日历里只放确定性信息
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
                {selectedNotice
                  ? selectedNotice.title
                  : analysis.title || "手动输入的通知"}
              </p>
            </div>

            {FIELDS.map((field) => {
              const text = renderValue(analysis[field.key]);
              const isEmpty = text === "未识别";
              const showInferredHint =
                field.key === "deadline" &&
                analysis._inferredDeadline &&
                !isEmpty;

              return (
                <div key={field.key}>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <p className="text-xs font-semibold text-slate-500">
                      {field.label}
                    </p>
                    {field.ai && (
                      <span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-400">
                        AI
                      </span>
                    )}
                  </div>
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