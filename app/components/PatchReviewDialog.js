"use client";

// PatchReviewDialog：补充通知的变更对比确认弹窗。
// 逐字段展示改前/改后/依据原句，区分变化/不变/取消三种行，
// 列出未受影响的事项和注意事项，供同学确认后写回。
const FIELD_LABEL = {
  date: "日期",
  time: "时间",
  location: "地点",
  materials: "材料",
  cancel: "取消",
};

const KIND_BADGE = {
  changed: { text: "变化", cls: "bg-amber-100 text-amber-700" },
  unchanged: { text: "不变", cls: "bg-slate-100 text-slate-500" },
  cancelled: { text: "取消", cls: "bg-rose-100 text-rose-700" },
};

export default function PatchReviewDialog({
  review,
  rawText,
  alerts,
  onConfirm,
  onCancel,
  onFieldClick,
}) {
  const rows = review?.rows || [];
  const untouched = review?.untouched || [];
  const alertList = Array.isArray(alerts) ? alerts : [];
  const hasChanged = rows.some((r) => r.kind === "changed" || r.kind === "cancelled");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white p-5 shadow-xl">
        <h2 className="text-base font-semibold text-slate-800">
          确认补充通知的变更
        </h2>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="px-2 py-1 font-normal">项目</th>
                <th className="px-2 py-1 font-normal">变化前</th>
                <th className="px-2 py-1 font-normal">变化后</th>
                <th className="px-2 py-1 font-normal">依据原句</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const badge = KIND_BADGE[row.kind] || KIND_BADGE.changed;
                const rowCls =
                  row.kind === "unchanged"
                    ? "text-slate-400"
                    : row.kind === "cancelled"
                    ? "bg-rose-50/60"
                    : "bg-amber-50/60";
                return (
                  <tr key={i} className={"border-t border-slate-100 " + rowCls}>
                    <td className="px-2 py-1.5">
                      <span
                        className={
                          "mr-1.5 rounded px-1 py-0.5 text-[10px] font-medium " +
                          badge.cls
                        }
                      >
                        {badge.text}
                      </span>
                      <span className="text-slate-700">
                        {FIELD_LABEL[row.field] || row.field}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-slate-600">
                      {row.from ? row.from : "（空）"}
                    </td>
                    <td className="px-2 py-1.5 text-slate-800">
                      {row.to ? row.to : "（空）"}
                    </td>
                    <td className="px-2 py-1.5">
                      {row.quote ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (!onFieldClick || !row.quote) return;
                            const at = rawText ? rawText.indexOf(row.quote) : -1;
                            if (at < 0) return;
                            onFieldClick({
                              start: at,
                              end: at + row.quote.length,
                            });
                          }}
                          className="text-left text-blue-600 underline decoration-dotted hover:text-blue-700"
                        >
                          {row.quote}
                        </button>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-2 py-4 text-center text-slate-400">
                    没有可对比的字段
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="mt-4">
            <p className="text-xs font-medium text-slate-600">这些保持原样</p>
            {untouched.length > 0 ? (
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {untouched.map((u) => (
                  <li
                    key={u.index}
                    className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500"
                  >
                    {u.itemName}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-slate-400">无</p>
            )}
          </div>

          {alertList.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-xs font-semibold text-amber-800">需要你注意</p>
              <ul className="mt-1 list-disc pl-4 text-xs leading-relaxed text-amber-700">
                {alertList.map((a, i) => (
                  <li key={i}>{typeof a === "string" ? a : a?.message || JSON.stringify(a)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

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
            onClick={onConfirm}
            disabled={!hasChanged}
            className={
              "rounded-md px-3 py-1.5 text-xs font-medium text-white " +
              (hasChanged
                ? "bg-blue-600 hover:bg-blue-700"
                : "cursor-not-allowed bg-slate-300")
            }
          >
            确认更新
          </button>
        </div>
      </div>
    </div>
  );
}
