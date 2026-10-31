"use client";

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
  const sourceInfo = analysis ? getSourceInfo(analysis._source) : null;

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
          </>
        )}
      </div>
    </aside>
  );
}