"use client";

import { useState } from "react";
import { Button, Chip } from "./ui/ZbUI.js";
import { IconAlert, IconList, IconClock } from "./ui/Icons.js";

/**
 * 日程提醒列表。纯展示组件，不自己算提醒，alerts 由外层传入。
 *
 * 每条提醒渲染成一张卡片：
 *  - 第一行：图标 + 标题 + 类型标签（文字必须和颜色同时可辨）
 *  - 第二行：详情文字，灰色小一号，允许换行不截断
 *  - 第三行：牵涉事项，横向小按钮，点击跳原文
 *  - needEndTime 且传了 onFillEndTime 时，底部有补充结束时间入口
 *
 * alerts 为空时不渲染任何东西。
 */

const TYPE_CONF = {
  overlap: {
    label: "时间冲突",
    Icon: IconAlert,
    card: "border-amber-200 bg-amber-50/60",
    titleColor: "text-amber-800",
    chipTone: "warn",
  },
  cluster: {
    label: "截止事项集中",
    Icon: IconList,
    card: "border-blue-200 bg-blue-50/50",
    titleColor: "text-blue-800",
    chipTone: "brand",
  },
  needEndTime: {
    label: "结束时间待补充",
    Icon: IconClock,
    card: "border-blue-200 bg-blue-50/50",
    titleColor: "text-blue-800",
    chipTone: "brand",
  },
};

function itemKey(item) {
  if (!item) return "";
  return String(item.noticeId) + "|" + String(item.itemIndex);
}

function alertKey(alert) {
  if (!alert) return "";
  return typeof alert.key === "string" && alert.key
    ? alert.key
    : alert.type + "|" + (alert.items || []).map(itemKey).join(",");
}

function itemDraftKey(item) {
  return "endTime|" + itemKey(item);
}

export default function ScheduleAlerts({
  alerts,
  onOpenItem,
  onFillEndTime,
  className = "",
}) {
  // 每条提醒输入框里的值，默认为空字符串，不预填任何猜的时间
  const [draft, setDraft] = useState({});
  // 缺结束时间聚合卡：单独一个展开开关
  const [endTimeOpen, setEndTimeOpen] = useState(false);

  if (!Array.isArray(alerts) || alerts.length === 0) return null;

  const canFillEndTime = typeof onFillEndTime === "function";

  function updateDraft(key, value) {
    setDraft((prev) => (Object.assign({}, prev, { [key]: value })));
  }

  function handleConfirm(key, target) {
    const value = draft[key] || "";
    if (!value || !target) return;
    onFillEndTime(target.noticeId, target.itemIndex, value);
    // 补完清空这一项的输入值
    setDraft((prev) => {
      const next = Object.assign({}, prev);
      delete next[key];
      return next;
    });
  }

  // 把 needEndTime 提醒聚合成一张卡，事项按 noticeId+itemIndex 去重
  const endTimeAlerts = alerts.filter((a) => a && a.type === "needEndTime");
  const seen = new Set();
  const pendingItems = [];
  endTimeAlerts.forEach((a) => {
    const list = Array.isArray(a.items) ? a.items : [];
    list.forEach((item) => {
      if (!item) return;
      const k = itemKey(item);
      if (seen.has(k)) return;
      seen.add(k);
      pendingItems.push(item);
    });
  });
  const showEndTimeCard = pendingItems.length > 0;

  return (
    <ul
      className={["zb-enter flex flex-col gap-3", className]
        .filter(Boolean)
        .join(" ")}
    >
      {alerts.filter((alert) => alert && alert.type !== "needEndTime").map((alert) => {
        const conf = TYPE_CONF[alert.type] || TYPE_CONF.needEndTime;
        const Icon = conf.Icon;
        const key = alertKey(alert);
        const items = Array.isArray(alert.items) ? alert.items : [];

        return (
          <li
            key={key}
            className={[
              "rounded-[12px] border p-3",
              "transition-[border-color,box-shadow] duration-200 ease-out motion-reduce:transition-none",
              conf.card,
            ].join(" ")}
          >
            {/* 第一行：图标 + 标题 + 类型标签 */}
            <div className="flex items-center gap-2">
              <Icon
                size={16}
                className={["flex-none", conf.titleColor].join(" ")}
              />
              <span
                className={[
                  "min-w-0 flex-1 text-[14px] font-semibold",
                  conf.titleColor,
                ].join(" ")}
              >
                {alert.title || conf.label}
              </span>
              <Chip tone={conf.chipTone} className="flex-none">
                {conf.label}
              </Chip>
            </div>

            {/* 第二行：详情，灰色小一号，完整换行 */}
            {alert.detail ? (
              <p className="mt-1.5 text-[13px] leading-relaxed text-[#64748B]">
                {alert.detail}
              </p>
            ) : null}

            {/* 第三行：牵涉事项小按钮 */}
            {items.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {items.map((item) => {
                  const k = itemKey(item);
                  const label = item.name || "（未命名事项）";
                  return (
                    <Button
                      key={k}
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        if (onOpenItem) onOpenItem(item.noticeId, item.itemIndex);
                      }}
                    >
                      {label}
                    </Button>
                  );
                })}
              </div>
            ) : null}

          </li>
        );
        })}

      {showEndTimeCard ? (
        <li className="rounded-[12px] border border-blue-200 bg-blue-50/50 p-3">
          <div className="flex items-center gap-2">
            <IconClock size={16} className="flex-none text-blue-800" />
            <span className="min-w-0 flex-1 text-[14px] font-semibold text-blue-800">
              结束时间待补充
            </span>
            <Chip tone="brand" className="flex-none">
              结束时间待补充
            </Chip>
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[#64748B]">
            有{pendingItems.length}项活动未提供结束时间，暂无法判断时间冲突。
          </p>
          <div className="mt-2">
            {!endTimeOpen ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setEndTimeOpen(true)}
              >
                查看具体事项
              </Button>
            ) : (
              <div className="flex flex-col gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEndTimeOpen(false)}
                >
                  收起
                </Button>
                {pendingItems.map((item) => {
                  const ik = itemDraftKey(item);
                  const label = item.name || "（未命名事项）";
                  return (
                    <div key={ik} className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          if (onOpenItem)
                            onOpenItem(item.noticeId, item.itemIndex);
                        }}
                      >
                        {label}
                      </Button>
                      {canFillEndTime ? (
                        <>
                          <input
                            type="time"
                            value={draft[ik] || ""}
                            onChange={(e) => updateDraft(ik, e.target.value)}
                            className="h-8 rounded-[8px] border border-[#E2E8F0] bg-white px-2 text-[13px] text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45"
                          />
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={!draft[ik]}
                            onClick={() => handleConfirm(ik, item)}
                          >
                            确定
                          </Button>
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </li>
      ) : null}
    </ul>
  );
}
