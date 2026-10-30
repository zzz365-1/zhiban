"use client";

export default function NoticeList({ notices, selectedId, onSelect }) {
  return (
    <aside className="flex h-full flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
          已导入通知
        </h2>
      </div>
      <ul className="flex-1 overflow-y-auto">
        {notices.map((notice) => {
          const isSelected = notice.id === selectedId;
          return (
            <li key={notice.id}>
              <button
                type="button"
                onClick={() => onSelect(notice.id)}
                className={`w-full border-b border-slate-100 px-5 py-4 text-left transition-colors ${
                  isSelected
                    ? "border-l-2 border-l-blue-600 bg-blue-50"
                    : "border-l-2 border-l-transparent hover:bg-slate-50"
                }`}
              >
                <p
                  className={`text-sm leading-snug ${
                    isSelected
                      ? "font-medium text-blue-700"
                      : "text-slate-800"
                  }`}
                >
                  {notice.title}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {notice.source}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}