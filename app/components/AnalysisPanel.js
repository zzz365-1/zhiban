"use client";

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
              ? "把这条通知的原文粘贴到中间，点击「解析」后这里会显示提取结果。"
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
          </>
        )}
      </div>
    </aside>
  );
}