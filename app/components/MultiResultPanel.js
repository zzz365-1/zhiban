"use client";

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
    if (s) return s.length > 40 ? s.slice(0, 40) + "…" : s;
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

export default function MultiResultPanel({ items }) {
  if (!items || items.length === 0) return null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex flex-none items-center justify-between border-b border-slate-100 px-5 py-2.5">
        <span className="text-sm font-semibold text-slate-700">
          共 {items.length} 条结果
        </span>
        <span className="text-xs text-slate-400">
          确认没问题就点上面的「保存到我的通知」
        </span>
      </div>

      <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto px-5 py-3">
        {items.map((it, idx) => {
          const a = it.analysis || {};
          const when = [a.deadline, a.time].filter(Boolean).join(" ");
          const event = [a.eventDate, a.eventTime].filter(Boolean).join(" ");
          return (
            <li key={idx} className="py-3">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-[11px] font-medium text-slate-400">
                  第 {idx + 1} 条
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    STATUS_CLASS[it.status] || STATUS_CLASS.pending
                  }`}
                >
                  {STATUS_LABEL[it.status] || it.status}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                  {a.title || firstLine(it.text)}
                </span>
              </div>

              <div className="space-y-1 pl-1">
                <Row label="截止" value={when} />
                <Row label="活动" value={event} />
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
            </li>
          );
        })}
      </ul>
    </div>
  );
}
