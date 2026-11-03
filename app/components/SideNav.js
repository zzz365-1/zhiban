"use client";

import {
  IconHome,
  IconList,
  IconCalendar,
  IconRefresh,
  IconPlus,
  IconAlert,
  IconClock,
  IconArrowRight,
} from "./ui/Icons.js";

const NAV_ITEMS = [
  { key: "workbench", label: "工作台", Icon: IconHome, badge: null },
  { key: "notices", label: "我的通知", Icon: IconList, badge: "notices" },
  { key: "calendar", label: "日历", Icon: IconCalendar, badge: null },
  { key: "changes", label: "变更记录", Icon: IconRefresh, badge: "changes" },
];

const STAT_ROWS = [
  { key: "pending", label: "待确认", Icon: IconAlert, countKey: "pending" },
  { key: "soon", label: "即将截止", Icon: IconClock, countKey: "soon" },
  { key: "todo", label: "待办理", Icon: IconList, countKey: "todo" },
];

function formatCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 99 ? "99+" : String(n);
}

export default function SideNav({
  view,
  onViewChange,
  counts = {},
  onCreate,
  onBackWelcome,
  onFocusStat,
}) {
  const safeCounts = counts || {};

  const handleView = (key) => {
    if (onViewChange) onViewChange(key);
  };

  const handleStat = (key) => {
    if (onViewChange) onViewChange("workbench");
    if (onFocusStat) onFocusStat(key);
  };

  return (
    <nav
      aria-label="主导航"
      className="flex h-full w-[248px] flex-none flex-col bg-[#0F172A] text-white"
    >
      {/* 品牌区 */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[10px] bg-[#2563EB] text-[13px] font-bold text-white">
          知办
        </div>
        <div className="min-w-0">
          <div className="text-[15px] font-bold leading-tight text-white">
            知办
          </div>
          <div className="mt-0.5 text-[11px] leading-tight text-white/55">
            把校园通知变成清晰行动
          </div>
        </div>
      </div>

      {/* 新增通知 */}
      <div className="px-4">
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[10px] bg-[#2563EB] px-4 text-sm font-medium text-white transition-[background-color,transform,box-shadow] duration-200 ease-out hover:bg-blue-700 active:translate-y-px active:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 motion-reduce:transition-none"
        >
          <IconPlus size={16} />
          <span>新增通知</span>
        </button>
      </div>

      {/* 分割线 */}
      <div className="mx-4 mt-4 h-px bg-white/10" aria-hidden="true" />

      {/* 导航项 */}
      <div className="mt-2 flex flex-col gap-1 px-2">
        {NAV_ITEMS.map(({ key, label, Icon, badge }) => {
          const active = view === key;
          const badgeText = badge ? formatCount(safeCounts[badge]) : null;
          return (
            <button
              key={key}
              type="button"
              onClick={() => handleView(key)}
              aria-current={active ? "page" : undefined}
              className={[
                "relative flex h-10 w-full items-center gap-2.5 rounded-[8px] px-3 text-[13px] transition-[background-color,color] duration-200 ease-out motion-reduce:transition-none",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
                active
                  ? "bg-white/12 font-semibold text-white"
                  : "bg-transparent font-normal text-white/70 hover:bg-white/8 hover:text-white",
              ].join(" ")}
            >
              {active ? (
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-[3px] bg-[#2563EB]"
                />
              ) : null}
              <Icon size={16} className="flex-none" />
              <span className="min-w-0 flex-1 truncate text-left">{label}</span>
              {badgeText ? (
                <span className="flex-none rounded-[6px] bg-white/16 px-1.5 text-[11px] font-medium leading-5 text-white">
                  {badgeText}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* 统计区 */}
      <div className="mt-6 px-4">
        <div className="mb-1 text-[11px] font-medium text-white/45">
          需要关注
        </div>
        <div className="flex flex-col">
          {STAT_ROWS.map(({ key, label, Icon, countKey }) => {
            const count = Number(safeCounts[countKey]) || 0;
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleStat(key)}
                className="flex h-7 w-full items-center gap-2 rounded-[6px] px-1 text-left transition-colors duration-200 ease-out hover:bg-white/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 motion-reduce:transition-none"
              >
                <Icon size={14} className="flex-none text-white/45" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-white/75">
                  {label}
                </span>
                <span className="flex-none text-[16px] font-bold leading-none text-white">
                  {count > 99 ? "99+" : count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 返回欢迎页 */}
      <div className="mt-auto px-4 pb-4 pt-4">
        <button
          type="button"
          onClick={onBackWelcome}
          className="inline-flex items-center gap-1 text-[11px] text-white/50 transition-colors duration-200 ease-out hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 motion-reduce:transition-none"
        >
          <span className="inline-block rotate-180">
            <IconArrowRight size={12} />
          </span>
          <span>返回欢迎页</span>
        </button>
      </div>
    </nav>
  );
}
