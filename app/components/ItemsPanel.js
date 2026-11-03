"use client";

import { statusLabel } from "../lib/noticeItems.js";

const PROGRESS_FLOW = ["待办理", "已办理", "无需办理"];

const PROGRESS_CLS = {
  待办理: "bg-amber-50 text-amber-700 border-amber-200",
  已办理: "bg-green-50 text-green-700 border-green-200",
  无需办理: "bg-slate-100 text-slate-500 border-slate-200",
};

const STATUS_CLS = {
  ok: "",
  not_mentioned: "text-slate-400",
  not_applicable: "text-slate-400",
  pending: "text-amber-700",
  failed: "text-red-600",
};

function Value({ label, value, status, span, onLocate, stale }) {
  const text = value === null || value === undefined || value === "" ? null : value;
  const showStatus = !text && status !== "ok";
  const canLocate = Boolean(text && span && !stale);

  return (
    <div className="flex items-baseline gap-2 text-xs leading-relaxed">
      <span className="w-16 flex-none text-slate-400">{label}</span>
      {text ? (
        <button
          type="button"
          disabled={!canLocate}
          onClick={() => canLocate && onLocate(span)}
          className={`text-left ${
            canLocate
              ? "text-slate-800 underline decoration-dotted decoration-slate-300 underline-offset-2 hover:text-blue-600 hover:decoration-blue-400"
              : "cursor-default text-slate-800"
          } ${STATUS_CLS[status] || ""}`}
          title={canLocate ? "点一下定位到原文" : stale ? "原文已修改，依据失效，请重新解析" : ""}
        >
          {Array.isArray(text) ? text.join("、") : text}
        </button>
      ) : null}
      {showStatus ? (
        <span className={`${STATUS_CLS[status] || "text-slate-400"}`}>
          {statusLabel(status)}
        </span>
      ) : null}
      {status && status !== "ok" && text ? (
        <span className={`${STATUS_CLS[status]}`}>{statusLabel(status)}</span>
      ) : null}
    </div>
  );
}

export default function ItemsPanel({
  items,
  onLocate,
  onProgressChange,
  publishedAt,
  onPublishedAtChange,
  stale,
}) {
  if (!items || items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4">
        <p className="text-xs leading-relaxed text-slate-500">
          这条通知里没认出要办的事项。可能是原文没写日期，也可能是写法还没覆盖。
        </p>
      </div>
    );
  }

  const needBase = items.some((it) => it.status && it.status.date === "pending");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-500">
          事项清单（{items.length} 项）
        </h3>
        <span className="text-[11px] text-slate-400">
          {stale ? "原文已修改，依据待重新生成" : "点带点线的值可定位到原文"}
        </span>
      </div>

      {needBase && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-800">
            这条通知里的日期要按发布日期算
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-700">
            原文写的是明天这类相对说法，没有发布日期就没有基准。
            填了发布日期才能换算，不会默认按今天算。
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="date"
              value={publishedAt || ""}
              onChange={(e) => onPublishedAtChange(e.target.value)}
              className="rounded-md border border-amber-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-amber-400"
            />
            <span className="text-[11px] text-amber-600">通知发布日期</span>
          </div>
        </div>
      )}

      {items.map((item) => {
        const f = (item.evidence && item.evidence.fields) || {};
        const kindCls =
          item.timeType === "deadline"
            ? "bg-blue-50 text-blue-700"
            : "bg-purple-50 text-purple-700";

        return (
          <div
            key={item.key || item.seq}
            className={`rounded-xl border border-slate-200 bg-white p-3 ${
              stale ? "opacity-60" : ""
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-800">
                {item.name}
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${kindCls}`}
              >
                {item.timeTypeLabel}
              </span>
              <button
                type="button"
                onClick={() =>
                  onProgressChange(
                    item.seq,
                    PROGRESS_FLOW[
                      (PROGRESS_FLOW.indexOf(item.progress) + 1) %
                        PROGRESS_FLOW.length
                    ]
                  )
                }
                className={`ml-auto rounded border px-1.5 py-0.5 text-[11px] transition hover:brightness-95 ${
                  PROGRESS_CLS[item.progress] || PROGRESS_CLS["待办理"]
                }`}
                title="点一下切换办理状态"
              >
                {item.progress}
              </button>
            </div>

            <div className="mt-2 space-y-1">
              <Value
                label="日期时间"
                value={
                  item.date
                    ? item.date + (item.time ? " " + item.time : "")
                    : null
                }
                status={item.status ? item.status.date : "ok"}
                span={f.date || f.time}
                onLocate={onLocate}
                stale={stale}
              />
              <Value
                label="地点"
                value={item.location}
                status={item.status ? item.status.location : "ok"}
                span={f.location}
                onLocate={onLocate}
                stale={stale}
              />
              <Value
                label="材料"
                value={item.materials}
                status={item.status ? item.status.materials : "ok"}
                span={f.materials && f.materials[0]}
                onLocate={onLocate}
                stale={stale}
              />
              <Value
                label="面向对象"
                value={item.audience}
                status={item.status ? item.status.audience : "ok"}
                span={null}
                onLocate={onLocate}
                stale={stale}
              />
            </div>

            {item._issues && item._issues.length > 0 && (
              <p className="mt-2 text-[11px] leading-relaxed text-red-500">
                {item._issues.join("；")}
              </p>
            )}

            <div className="mt-2 border-t border-slate-100 pt-2">
              <p className="text-[11px] leading-relaxed text-slate-400">
                原文依据：
                {item.evidence && item.evidence.quote
                  ? item.evidence.quote.trim().slice(0, 60) +
                    (item.evidence.quote.trim().length > 60 ? "…" : "")
                  : "无"}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
