"use client";

/**
 * 重复导入提示。
 *
 * 【为什么要分两种】
 * 正文一字不差的那是真重复，正常做法是跳过。
 * 标题一样但正文不一样，多半是改过的通知或者同系列通知，
 * 既不能当重复丢掉，也不能闷声把旧的那条盖了，必须由用户决定。
 */

export default function DuplicateDialog({
  open,
  type,
  title,
  onView,
  onSkip,
  onImportAnyway,
  onClose,
}) {
  if (!open) return null;

  const exact = type === "exact";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-slate-800">
          {exact ? "这条通知已经导入过" : "有一条标题相同的通知"}
        </h3>

        <p className="mt-2 text-xs leading-relaxed text-slate-600">
          {exact
            ? "正文完全一致，重复导入会让同一件事在日历里出现两次。已有通知的标题是："
            : "标题相同但正文不一样，可能是改过的通知。程序不会替你判断，也不会覆盖原来那条。已有通知的标题是："}
        </p>

        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
          {title || "（无标题）"}
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50"
          >
            关闭
          </button>
          <button
            type="button"
            onClick={onView}
            className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-600 transition hover:bg-blue-50"
          >
            查看已有通知
          </button>
          {exact ? (
            <button
              type="button"
              onClick={onSkip}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700"
            >
              跳过这条
            </button>
          ) : (
            <button
              type="button"
              onClick={onImportAnyway}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700"
            >
              仍然导入为新通知
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
