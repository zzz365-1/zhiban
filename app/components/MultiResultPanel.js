"use client";

import { useState } from "react";
import { getNoticeTimeType } from "../lib/noticeItems.js";
import { NO_TIME_NOTE } from "../lib/deadline.js";

/**
 * 多通知解析结果面板。
 *
 * 【为什么放在下半区】以前多通知的结果就贴在输入框下面那一小块里，
 * 三条通知挤在一起，往下看不见。现在和单条通知用同一个位置，
 * 一条一块，块多了自己滚动，跟单条的体验对齐。
 */

const STATUS_LABEL = {
  pending: "待解析",
  success: "已解析",
  fallback: "规则兜底",
  duplicate: "与已有通知重复",
  error: "解析失败",
};

const STATUS_CLASS = {
  pending: "bg-slate-100 text-slate-500",
  success: "bg-green-50 text-green-700",
  fallback: "bg-amber-50 text-amber-700",
  duplicate: "bg-slate-100 text-slate-400",
  error: "bg-red-50 text-red-600",
};

function firstLine(t) {
  const lines = String(t || "").split(String.fromCharCode(10));
  for (const line of lines) {
    const s = line.trim();
    // 与 page.js 的 deriveTitle 保持一致：截三十字加省略号，
    // 免得同一条通知保存前后标题跳变。
    if (s) return s.length > 30 ? s.slice(0, 30) + "…" : s;
  }
  return "未命名通知";
}

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-xs leading-relaxed">
      <span className="flex-none text-slate-400">{label}</span>
      <span className="text-slate-700">{value}</span>
    </div>
  );
}

const DUP_LABEL = {
  exact: "完全重复",
  similar: "疑似重复（正文高度相似）",
  title_same: "标题相同，正文不同",
};

export default function MultiResultPanel({
  items,
  onSave,
  onSkip,
  canSave,
  saveLabel,
}) {
  // 展开查重详情用的下标集合；同批次命中时没有 id，只能按下标记
  const [openDup, setOpenDup] = useState({});

  if (!items || items.length === 0) return null;

  function toggleDup(idx) {
    setOpenDup((prev) => ({ ...prev, [idx]: !prev[idx] }));
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex flex-none items-center justify-between border-b border-slate-100 px-5 py-2.5">
        <span className="text-sm font-semibold text-slate-700">
          共 {items.length} 条结果
        </span>
        <button
          type="button"
          onClick={() => {
            if (onSave) onSave();
          }}
          disabled={!onSave || !canSave}
          className="inline-flex h-9 items-center rounded-[10px] bg-[#1D4ED8] px-3 text-[13px] font-medium text-white transition-colors duration-200 ease-out hover:bg-[#1E40AF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 motion-reduce:transition-none"
        >
          {saveLabel || "保存到我的通知"}
        </button>
      </div>

      <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto px-5 py-3">
        {items.map((it, idx) => {
          const a = it.analysis || {};
          const when = [a.deadline, a.time].filter(Boolean).join(" ");
          const event = [a.eventDate, a.eventTime].filter(Boolean).join(" ");
          // 讲座这类按开始处理的通知，日期在 deadline、时刻在 time。
          // 活动时刻只有真写了才顶替 time，别把 deadline 里的日期丢了。
          const timeType = getNoticeTimeType(a);
          const startDate = a.deadline || a.eventDate;
          const startTime = a.eventTime || a.time;
          const eventText = event;
          return (
            <li key={idx} className="py-3">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-[11px] font-medium text-slate-400">
                  第 {idx + 1} 条
                </span>
                {it.dupInfo && it.dupInfo.type !== "none" ? (
                  <>
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                      {it.dupInfo.type === "exact"
                        ? "已存在"
                        : it.dupInfo.type === "similar"
                        ? "疑似重复"
                        : it.dupInfo.type === "title_same"
                        ? "标题相同"
                        : "疑似重复"}
                    </span>
                    {!it.skip && (
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                        明确另存
                      </span>
                    )}
                  </>
                ) : (
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      STATUS_CLASS[it.status] || STATUS_CLASS.pending
                    }`}
                  >
                    {STATUS_LABEL[it.status] || it.status}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                  {a.title || firstLine(it.text)}
                </span>
              </div>

              <div className="space-y-1 pl-1">
                <Row
                  label={timeType === "start" ? "开始" : "截止"}
                  value={
                    timeType === "start"
                      ? startDate
                        ? [startDate, startTime || NO_TIME_NOTE].join(" ")
                        : NO_TIME_NOTE
                      : a.deadline
                      ? [a.deadline, a.time || NO_TIME_NOTE].join(" ")
                      : when
                  }
                />
                <Row label="活动" value={eventText} />
                <Row label="地点" value={a.location} />
                <Row
                  label="材料"
                  value={
                    a.materials && a.materials.length > 0
                      ? a.materials.join("、")
                      : null
                  }
                />
                <Row label="对象" value={a.audience} />
                <Row label="分类" value={a.category} />
              </div>

              {it.errorMsg && (
                <p className="mt-1.5 pl-1 text-[11px] text-red-500">
                  {it.errorMsg}
                </p>
              )}

              {it.dupInfo && it.dupInfo.type !== "none" && (
                <div className="mt-1.5 pl-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                      {DUP_LABEL[it.dupInfo.type] || "疑似重复"}
                      {it.dupInfo.withinBatch ? "（同批次内）" : ""}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      当前：{it.skip ? "跳过" : "明确另存"}
                    </span>
                    {it.dupInfo.notice && it.dupInfo.notice.text && (
                      <button
                        type="button"
                        onClick={() => toggleDup(idx)}
                        className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
                      >
                        {openDup[idx] ? "收起已有正文" : "查看已有正文"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (onSkip) onSkip(idx, true);
                      }}
                      className={`rounded border px-2 py-0.5 text-[11px] ${
                        it.skip
                          ? "border-blue-300 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      跳过本条
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (onSkip) onSkip(idx, false);
                      }}
                      className={`rounded border px-2 py-0.5 text-[11px] ${
                        !it.skip
                          ? "border-blue-300 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      明确另存
                    </button>
                  </div>
                  {openDup[idx] &&
                    it.dupInfo.notice &&
                    it.dupInfo.notice.text && (
                      <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap rounded bg-slate-50 px-2 py-1 text-[11px] leading-relaxed text-slate-600">
                        {it.dupInfo.notice.text}
                      </p>
                    )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
