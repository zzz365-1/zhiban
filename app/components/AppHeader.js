"use client";

import { Button } from "./ui/ZbUI.js";
import { IconSearch } from "./ui/Icons.js";

const CATEGORIES = [
  { value: "all", label: "全部" },
  { value: "教务", label: "教务" },
  { value: "活动", label: "活动" },
  { value: "行政", label: "行政" },
  { value: "后勤", label: "后勤" },
  { value: "其他", label: "其他" },
  { value: "示例", label: "示例" },
];

export default function AppHeader({
  title,
  subtitle,
  right,
  searchQuery,
  onSearchChange,
  category,
  onCategoryChange,
  onOpenShare,
}) {
  return (
    <header className="flex h-[60px] flex-none items-center justify-between gap-4 border-b border-[#E2E8F0] bg-white px-6">
      {/* 左侧标题 */}
      <div className="min-w-0">
        <div className="truncate text-[16px] font-bold leading-tight text-[#0F172A]">
          {title}
        </div>
        {subtitle ? (
          <div className="mt-0.5 truncate text-[12px] leading-tight text-[#64748B]">
            {subtitle}
          </div>
        ) : null}
      </div>

      {/* 右侧操作 */}
      <div className="flex flex-none items-center gap-3">
        {/* 搜索框 */}
        <div className="relative w-[240px]">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]">
            <IconSearch size={16} />
          </span>
          <input
            type="text"
            value={searchQuery || ""}
            onChange={(e) => {
              if (onSearchChange) onSearchChange(e.target.value);
            }}
            placeholder="搜索通知"
            className="zb-input h-9 w-full pl-9 text-[13px]"
          />
        </div>

        {/* 分类下拉 */}
        <select
          value={category || "all"}
          onChange={(e) => {
            if (onCategoryChange) onCategoryChange(e.target.value);
          }}
          className="h-9 rounded-[10px] border border-[#E2E8F0] bg-white px-3 text-[13px] text-[#0F172A] outline-none transition-colors duration-200 ease-out focus:border-[#93C5FD] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.12)] motion-reduce:transition-none"
        >
          {CATEGORIES.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        {/* 整理成文字 */}
        <Button variant="secondary" size="sm" onClick={onOpenShare}>
          整理成文字
        </Button>

        {/* 右侧自定义节点 */}
        {right ? <div className="flex-none">{right}</div> : null}
      </div>
    </header>
  );
}
