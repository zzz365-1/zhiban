"use client";

import { Card, SectionTitle, EmptyState, Button } from "./ui/ZbUI.js";
import {
  IconAlert,
  IconClock,
  IconList,
  IconPlus,
} from "./ui/Icons.js";
import ItemCard from "./ItemCard.js";
import ScheduleAlerts from "./ScheduleAlerts.js";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function todayLabel(now) {
  const d = new Date(now);
  return (
    "今天 " +
    (d.getMonth() + 1) +
    "月" +
    d.getDate() +
    "日 星期" +
    WEEKDAYS[d.getDay()]
  );
}

export function itemKey(event) {
  if (!event) return "";
  return String(event.noticeId) + "-" + String(event.itemIndex);
}

const STAT_CARDS = [
  { key: "pending", label: "待确认", Icon: IconAlert, tone: "amber" },
  { key: "soon", label: "即将截止", Icon: IconClock, tone: "red" },
  { key: "todo", label: "待办理", Icon: IconList, tone: "blue" },
];

const TONE_CLASS = {
  amber: "text-[#D97706]",
  red: "text-[#DC2626]",
  blue: "text-[#2563EB]",
};

const SECTIONS = [
  { key: "pending", title: "待确认事项", empty: "没有需要确认的事项" },
  { key: "soon", title: "即将截止", empty: "未来三天没有要办的事" },
  { key: "todo", title: "待办理事项", empty: "暂时没有待办事项" },
];

export default function WorkspaceOverview({
  now,
  groups,
  stats,
  focus,
  selectedKey,
  onOpenItem,
  onComplete,
  onToggleMaterial,
  onFocusStat,
  onCreate,
  alerts,
  onFillEndTime,
}) {
  const safeNow = typeof now === "number" ? now : Date.now();
  const safeGroups = groups || {};
  const safeStats = stats || {};

  const pending = Array.isArray(safeGroups.pending) ? safeGroups.pending : [];
  const soon = Array.isArray(safeGroups.soon) ? safeGroups.soon : [];
  const todo = Array.isArray(safeGroups.todo) ? safeGroups.todo : [];

  const groupMap = { pending, soon, todo };

  const totalNotices = Number(safeStats.notices) || 0;
  const allEmpty =
    pending.length === 0 &&
    soon.length === 0 &&
    todo.length === 0 &&
    totalNotices === 0;

  if (allEmpty) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-[24px] font-bold leading-tight text-[#0F172A]">
            工作台
          </h1>
          <p className="mt-1 text-[13px] text-[#64748B]">
            {todayLabel(safeNow)}
          </p>
        </div>
        <div className="zb-card">
          <EmptyState
            icon={<IconList size={40} />}
            title="还没有通知"
            description="点左上角的新增通知，把一条校园通知粘贴进去，就能看到要做什么。"
            action={
              <Button
                variant="primary"
                size="md"
                icon={<IconPlus size={16} />}
                onClick={onCreate}
              >
                新增通知
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      {/* 页头 */}
      <div className="mb-6">
        <h1 className="text-[24px] font-bold leading-tight text-[#0F172A]">
          工作台
        </h1>
        <p className="mt-1 text-[13px] text-[#64748B]">
          {todayLabel(safeNow)}
        </p>
      </div>

      {/* 提醒区：alerts 为空时整块不渲染 */}
      {Array.isArray(alerts) && alerts.length > 0 ? (
        <div className="mb-6">
          <SectionTitle>需要关注</SectionTitle>
          <ScheduleAlerts
            alerts={alerts}
            onOpenItem={(noticeId, itemIndex) => {
              if (!onOpenItem) return;
              const all = pending.concat(soon).concat(todo);
              const ev = all.find(
                (e) =>
                  String(e.noticeId) === String(noticeId) &&
                  String(e.itemIndex) === String(itemIndex)
              );
              if (ev) onOpenItem(ev);
            }}
            onFillEndTime={onFillEndTime}
          />
        </div>
      ) : null}

      {/* 统计卡 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {STAT_CARDS.map(({ key, label, Icon, tone }) => {
          const count = Number(safeStats[key]) || 0;
          const numClass = TONE_CLASS[tone] || TONE_CLASS.blue;
          return (
            <Card
              key={key}
              selected={focus === key}
              onClick={() => {
                if (onFocusStat) onFocusStat(key);
              }}
              className="p-4"
            >
              <div className="flex flex-col">
                <div className="flex items-center justify-between">
                  <Icon size={16} className="text-[#94A3B8]" />
                </div>
                <div
                  className={[
                    "mt-1.5 text-[36px] font-bold leading-none",
                    numClass,
                  ].join(" ")}
                >
                  {count > 99 ? "99+" : count}
                </div>
                <div className="mt-2 text-[12px] text-[#64748B]">{label}</div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* 三个区块 */}
      {SECTIONS.map(({ key, title, empty }) => {
        const list = groupMap[key] || [];
        const count = list.length;
        return (
          <section key={key}>
            <SectionTitle
              extra={
                <span className="text-[12px] text-[#64748B]">共 {count} 条</span>
              }
            >
              {title}
            </SectionTitle>

            {count === 0 ? (
              <div className="zb-card">
                <EmptyState title={empty} />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {list.map((event) => {
                  const k = itemKey(event);
                  return (
                    <ItemCard
                      key={k}
                      event={event}
                      now={safeNow}
                      selected={!!selectedKey && selectedKey === k}
                      alerts={alerts}
                      onOpen={
                        onOpenItem ? () => onOpenItem(event) : undefined
                      }
                      onComplete={
                        onComplete
                          ? (target) => onComplete(event, target)
                          : undefined
                      }
                      onToggleMaterial={
                        onToggleMaterial
                          ? (index, checked) =>
                              onToggleMaterial(event, index, checked)
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
