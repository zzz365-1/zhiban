"use client";

const FIELDS = [
  { key: "deadline", label: "截止日期" },
  { key: "location", label: "地点" },
  { key: "materials", label: "需提交材料" },
  { key: "actions", label: "需要做什么" },
];

export default function AnalysisPanel({ selectedNotice }) {
  return (
    <aside className="flex h-full flex-col border-l border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
          解析结果
        </h2>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {!selectedNotice && (
          <p className="text-sm leading-relaxed text-slate-400">
            在左侧选择一条已导入的通知，这里会显示它的解析栏目。
          </p>
        )}

        {selectedNotice && (
          <>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-medium text-slate-400">当前通知</p>
              <p className="mt-1 text-sm font-medium leading-snug text-slate-800">
                {selectedNotice.title}
              </p>
            </div>

            {FIELDS.map((field) => (
              <div key={field.key}>
                <p className="mb-1.5 text-xs font-semibold text-slate-500">
                  {field.label}
                </p>
                <div className="min-h-[56px] rounded-lg border border-dashed border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-400">
                  待解析
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </aside>
  );
}