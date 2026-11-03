"use client";

export default function DuplicateDialog({
  duplicate,
  onClose,
  onView,
  onImport,
  onCancel,
}) {
  if (!duplicate) return null;
  const { type, notice } = duplicate;
  const isExact = type === "exact";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h2 className="text-base font-semibold text-slate-800">
          {isExact ? "这条通知已经存在" : "标题相同的通知已存在"}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          {isExact
            ? "正文与已有的一条通知完全一样，看起来是重复导入。"
            : "已有通知的标题相同但正文不同，这可能是修改过的版本。请确认后再决定是否导入。"}
        </p>
        {notice && notice.title && (
          <p className="mt-2 truncate rounded bg-slate-50 px-2 py-1 text-xs text-slate-500">
            已有：{notice.title}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          {isExact ? (
            <>
              <button
                type="button"
                onClick={onView}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
              >
                查看已有
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                跳过
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onCancel}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={onView}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
              >
                查看已有
              </button>
              <button
                type="button"
                onClick={onImport}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                仍然导入
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
