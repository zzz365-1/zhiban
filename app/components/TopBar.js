"use client";

const TABS = [
  { key: "todo", label: "待办" },
  { key: "calendar", label: "日历" },
  { key: "all", label: "全部通知" },
];

const CATEGORIES = ["全部", "教务", "活动", "行政", "后勤", "其他"];

export default function TopBar({
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  category,
  onCategoryChange,
  parsing,
  onOpenShare,
  onOpenBatch,
}) {
  return (
    <header className="flex h-12 flex-none items-center gap-3 border-b border-slate-200 bg-white px-4 shadow-sm">
      <span className="text-base font-bold tracking-tight text-slate-900">
        知办
      </span>

      <nav className="flex gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onTabChange(tab.key)}
            className={`rounded-md px-3 py-1.5 text-sm transition ${
              activeTab === tab.key
                ? "bg-blue-50 font-medium text-blue-700"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {parsing && <span className="text-xs text-blue-500">正在解析…</span>}

      <div className="ml-auto flex items-center gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="搜索通知"
          className="w-36 rounded-md border border-slate-200 px-2.5 py-1 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
        <select
          value={category}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 outline-none focus:border-blue-400"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onOpenBatch}
          className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
        >
          批量粘贴
        </button>
        <button
          type="button"
          onClick={onOpenShare}
          className="rounded-md border border-blue-200 bg-white px-3 py-1 text-xs font-medium text-blue-600 transition hover:bg-blue-50"
        >
          整理成文字
        </button>
      </div>
    </header>
  );
}