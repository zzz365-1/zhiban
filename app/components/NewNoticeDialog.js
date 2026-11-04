"use client";

import { useState } from "react";

import { Modal, Button } from "./ui/ZbUI.js";
import { parseUserDateInput } from "../lib/deadline.js";

const MODES = [
  { key: "single", label: "单条通知" },
  { key: "multi", label: "多通知" },
];

export default function NewNoticeDialog({
  open,
  value,
  onChange,
  mode,
  onModeChange,
  parsing,
  onParse,
  onClose,
  publishedAt,
  onPublishedAtChange,
}) {
  const isMulti = mode === "multi";

  // 发布日期输入框的本地草稿：避免上层只回传标准格式时吞掉打字中间态
  const [dateDraft, setDateDraft] = useState(publishedAt || "");

  // 上一次回传给上层/最后一次由上层同步进来的标准值，用于判断是否需要重置草稿
  const [lastCommitted, setLastCommitted] = useState(publishedAt || "");

  // 外部值变化（例如弹窗重开、上层刷新）时同步草稿
  if ((publishedAt || "") !== lastCommitted) {
    setLastCommitted(publishedAt || "");
    setDateDraft(publishedAt || "");
  }

  function toDashDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const trimmedDraft = (dateDraft || "").trim();
  let dateError = "";
  if (trimmedDraft !== "") {
    const parsed = parseUserDateInput(trimmedDraft);
    if (!parsed || !parsed.date || Number.isNaN(parsed.date.getTime())) {
      dateError = "日期没认出来，请按「2026年11月3日」或「2026-11-03」这样的写法填写。";
    }
  }

  function handleDateChange(raw) {
    setDateDraft(raw);
    if (raw.trim() === "") {
      // 留空就是留空，绝不补今天
      setLastCommitted("");
      if (onPublishedAtChange) onPublishedAtChange("");
      return;
    }
    const parsed = parseUserDateInput(raw.trim());
    if (!parsed || !parsed.date || Number.isNaN(parsed.date.getTime())) {
      // 输入暂时不合法：不清空上层值也不覆盖，等用户继续输入
      return;
    }
    const normalizedDash = toDashDate(parsed.date);
    setLastCommitted(normalizedDash);
    if (onPublishedAtChange) onPublishedAtChange(normalizedDash);
  }

  const hint = isMulti
    ? "一次粘贴好几条，通知之间要空一行，解析前会先让你确认怎么切分。"
    : "把一条通知的原文粘贴进来，点解析就能看到要做什么。";

  const placeholder = isMulti
    ? "把多条通知的原文粘贴到这里，通知之间空一行"
    : "把一条通知的原文粘贴到这里";

  const isEmpty = !value || value.trim() === "";
  const parseDisabled = isEmpty || !!parsing;

  return (
    <Modal
      open={open}
      title="新增通知"
      onClose={onClose}
      width={720}
      footer={
        <>
          <Button
            variant="secondary"
            size="md"
            disabled={!!parsing}
            onClick={onClose}
          >
            取消
          </Button>
          <Button
            variant="primary"
            size="md"
            loading={!!parsing}
            disabled={parseDisabled}
            onClick={onParse}
          >
            开始解析
          </Button>
        </>
      }
    >
      {/* 模式切换 */}
      <div className="inline-flex items-center gap-1 rounded-[8px] bg-slate-100 p-1">
        {MODES.map(({ key, label }) => {
          const active = mode === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                if (onModeChange) onModeChange(key);
              }}
              aria-pressed={active}
              className={[
                "inline-flex h-8 items-center justify-center rounded-[6px] px-3 text-[13px] transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 motion-reduce:transition-none",
                active
                  ? "bg-white font-medium text-[#2563EB] shadow-[0_1px_3px_rgba(15,23,42,0.10)]"
                  : "bg-transparent text-[#64748B] hover:text-[#0F172A]",
              ].join(" ")}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* 提示小字 */}
      <p className="mt-2.5 text-[12px] leading-relaxed text-[#64748B]">
        {hint}
      </p>

      {/* 通知发布日期（选填）：只作换算基准，留空则保持待确认 */}
      <div className="mt-3">
        <label
          htmlFor="notice-publish-date"
          className="block text-[13px] font-medium text-[#0F172A]"
        >
          通知发布日期
          <span className="ml-1 font-normal text-[#94A3B8]">（选填）</span>
        </label>
        <input
          id="notice-publish-date"
          type="text"
          inputMode="text"
          autoComplete="off"
          value={dateDraft}
          placeholder="例如：2026年11月3日"
          aria-invalid={dateError ? "true" : undefined}
          aria-describedby={
            dateError ? "notice-publish-date-error" : "notice-publish-date-hint"
          }
          onChange={(e) => {
            handleDateChange(e.target.value);
          }}
          onBlur={() => {
            // 失焦时若草稿是合法日期，统一回显成标准写法；留空保持空
            if (trimmedDraft === "") return;
            const parsed = parseUserDateInput(trimmedDraft);
            if (parsed && parsed.date && !Number.isNaN(parsed.date.getTime())) {
              const normalizedDash = toDashDate(parsed.date);
              setDateDraft(normalizedDash);
              setLastCommitted(normalizedDash);
            }
          }}
          className="zb-input mt-2 w-full"
        />
        {dateError ? (
          <p
            id="notice-publish-date-error"
            className="mt-1.5 text-[12px] leading-relaxed text-[#DC2626]"
          >
            {dateError}
          </p>
        ) : (
          <p
            id="notice-publish-date-hint"
            className="mt-1.5 text-[12px] leading-relaxed text-[#64748B]"
          >
            原文里有「下周三」「明天」这种说法时，填上发布日期才能换算成具体日期；留空就保持待确认。
          </p>
        )}
      </div>

      {/* 文本输入 */}
      <textarea
        value={value || ""}
        onChange={(e) => {
          if (onChange) onChange(e.target.value);
        }}
        placeholder={placeholder}
        className="zb-input mt-3 block w-full resize-none leading-[1.8]"
        style={{ minHeight: 120, maxHeight: "45vh", overflowY: "auto" }}
        onInput={(e) => {
          // 先按内容收缩再撑开，避免只增不减
          e.currentTarget.style.height = "auto";
          e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
        }}
      />
    </Modal>
  );
}
