"use client";

import { useState } from "react";
import { Button, Card, EmptyState } from "./ui/ZbUI.js";
import {
  IconPlus,
  IconCheck,
  IconX,
  IconArrowRight,
  IconRefresh,
  IconChevronDown,
  IconChevronUp,
} from "./ui/Icons.js";

const FIELD_LABELS = {
  date: "日期",
  time: "时间",
  location: "地点",
  materials: "材料",
  cancelled: "取消",
};

function fieldLabel(field) {
  return FIELD_LABELS[field] || field;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return (
    d.getFullYear() +
    "年" +
    pad2(d.getMonth() + 1) +
    "月" +
    pad2(d.getDate()) +
    "日 " +
    pad2(d.getHours()) +
    ":" +
    pad2(d.getMinutes())
  );
}

// 材料值：数组里可能是字符串，也可能是带 name 的对象
function formatMaterials(value) {
  if (!Array.isArray(value)) {
    return value ? String(value) : "";
  }
  return value
    .map((m) => {
      if (m == null) return "";
      if (typeof m === "string") return m;
      if (typeof m === "object" && m.name != null) return String(m.name);
      return "";
    })
    .filter((s) => s !== "")
    .join("、");
}

function formatValue(field, value) {
  if (field === "cancelled") {
    return value ? "已取消" : "未取消";
  }
  if (field === "materials") {
    return formatMaterials(value);
  }
  if (value == null || value === "") return "未填写";
  return String(value);
}

export default function ChangeCenter({
  notices,
  success,
  onDismissSuccess,
  onOpenNotice,
  onCreatePatch,
  highlightNoticeId,
}) {
  // 展开状态按历史序号记，组件内部维护
  const [expanded, setExpanded] = useState({});

  const changedNotices = (Array.isArray(notices) ? notices : []).filter(
    (n) => Array.isArray(n.history) && n.history.length > 0
  );

  const successItemNames =
    success && Array.isArray(success.itemNames) ? success.itemNames : [];

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-8">
      {/* 顶部标题栏 */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[24px] font-bold text-[#0F172A]">变更记录</h1>
          <p className="mt-1 text-[12px] leading-relaxed text-[#64748B]">
            这里汇总每条通知被补充通知改过的地方，前后是什么，依据是哪句话。
          </p>
        </div>
        <div className="flex-none">
          <Button
            variant="primary"
            icon={<IconPlus size={16} />}
            onClick={onCreatePatch}
          >
            粘贴补充通知
          </Button>
        </div>
      </div>

      {/* 成功提示：样式文件里已定义的入场动画类名是 zb-enter */}
      {success && (
        <div className="mt-4">
          <div className="zb-enter relative overflow-hidden rounded-[12px] border border-[#E2E8F0] bg-white pl-4 shadow-[0_0.5px_3px_rgba(15,23,42,0.06)]">
            <span
              aria-hidden="true"
              className="absolute left-0 top-0 h-full w-1 bg-emerald-500"
            />
            <div className="flex items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <IconCheck size={16} className="text-emerald-600" />
                  <span className="text-[14px] font-bold text-emerald-600">
                    更新成功
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[12px] text-[#64748B]">
                    受影响事项
                  </span>
                  {successItemNames.length > 0 ? (
                    successItemNames.map((name, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center rounded-[6px] bg-blue-50 px-2 py-0.5 text-[12px] font-medium text-blue-700"
                      >
                        {name}
                      </span>
                    ))
                  ) : (
                    <span className="text-[12px] text-[#64748B]">
                      这次没有改动到具体事项
                    </span>
                  )}
                </div>

                {success.title && (
                  <div className="mt-1.5 text-[12px] text-[#64748B]">
                    {success.title}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={onDismissSuccess}
                aria-label="关闭"
                className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-[6px] text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 motion-reduce:transition-none"
              >
                <IconX size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 变更列表 / 空态 */}
      {changedNotices.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<IconRefresh size={40} />}
            title="还没有变更记录"
            description="收到补充通知之后粘贴进来，这里会显示改了什么。"
            action={
              <Button
                variant="primary"
                icon={<IconPlus size={16} />}
                onClick={onCreatePatch}
              >
                粘贴补充通知
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {changedNotices.map((notice) => {
            const history = [...notice.history].sort(
              (a, b) => (b.time || 0) - (a.time || 0)
            );
            return (
              <Card key={notice.id}>
                <div className="flex items-center gap-3">
                  <h2 className="min-w-0 flex-1 truncate text-[15px] font-bold text-[#0F172A]">
                    {notice.title || "未命名通知"}
                  </h2>
                  <span className="flex-none text-[12px] text-[#64748B]">
                    共 {history.length} 次
                  </span>
                  <div className="flex-none">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onOpenNotice && onOpenNotice(notice.id)}
                    >
                      查看这条通知
                    </Button>
                  </div>
                </div>

                <div className="mt-3">
                  {history.map((record, idx) => {
                    const changes = Array.isArray(record.changes)
                      ? record.changes
                      : [];
                    const expandKey = notice.id + "-" + idx;
                    const open = Boolean(expanded[expandKey]);
                    return (
                      <div
                        key={record.time || idx}
                        className={
                          idx === 0
                            ? "pt-0"
                            : "mt-3 border-t border-slate-100 pt-3"
                        }
                      >
                        <div className="text-[12px] text-[#64748B]">
                          {formatTime(record.time)}
                        </div>
                        {record.summary && (
                          <div className="mt-1 text-[14px] text-[#0F172A]">
                            {record.summary}
                          </div>
                        )}

                        {changes.length > 0 && (
                          <div className="mt-2 space-y-3">
                            {changes.map((change, ci) => {
                              // 只在刚刚确认过更新的那条通知的最新一次变更上闪一下，
                              // 翻看历史的时候不闪，免得每次进来都闪很吵
                              const flash =
                                Boolean(success) &&
                                idx === 0 &&
                                (!highlightNoticeId ||
                                  highlightNoticeId === notice.id);
                              return (
                              <div
                                key={ci}
                                className={flash ? "zb-highlight" : ""}
                              >
                                <div className="text-[12px] font-medium text-[#64748B]">
                                  {fieldLabel(change.field)}
                                </div>
                                <div className="mt-1 flex items-center gap-2">
                                  <div className="min-w-0 rounded-[6px] bg-slate-100 px-2 py-1">
                                    <div className="text-[10px] text-slate-400">
                                      变化前
                                    </div>
                                    <div className="truncate text-[13px] text-slate-400 line-through">
                                      {formatValue(change.field, change.from)}
                                    </div>
                                  </div>
                                  <div className="flex-none text-slate-400">
                                    <IconArrowRight size={14} />
                                  </div>
                                  <div className="min-w-0 rounded-[6px] bg-slate-50 px-2 py-1">
                                    <div className="text-[10px] text-slate-400">
                                      变化后
                                    </div>
                                    <div className="truncate text-[13px] font-bold text-[#0F172A]">
                                      {formatValue(change.field, change.to)}
                                    </div>
                                  </div>
                                </div>
                                {change.quote && (
                                  <div className="mt-1 line-clamp-2 text-[12px] text-slate-400">
                                    依据原句：{change.quote}
                                  </div>
                                )}
                              </div>
                              );
                            })}
                          </div>
                        )}

                        {record.rawText && (
                          <div className="mt-2">
                            <button
                              type="button"
                              onClick={() =>
                                setExpanded((prev) => ({
                                  ...prev,
                                  [expandKey]: !prev[expandKey],
                                }))
                              }
                              className="inline-flex items-center gap-1 text-[11px] text-slate-400 transition-colors duration-200 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 motion-reduce:transition-none"
                            >
                              {open ? (
                                <IconChevronUp size={12} />
                              ) : (
                                <IconChevronDown size={12} />
                              )}
                              查看当时的补充通知原文
                            </button>
                            {open && (
                              <div className="mt-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-[6px] bg-slate-50 p-2 text-[13px] leading-[1.8] text-slate-600">
                                {record.rawText}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
