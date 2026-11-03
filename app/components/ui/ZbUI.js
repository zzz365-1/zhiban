"use client";

import { useEffect, useRef } from "react";
import {
  IconCircle,
  IconCheck,
  IconMinus,
  IconAlert,
  IconClock,
  IconPencil,
  IconSpinner,
  IconX,
} from "./Icons.js";

/* ---------------------------------------------------------------- Button */

const BTN_BASE =
  "inline-flex items-center justify-center gap-2 rounded-[10px] font-medium " +
  "transition-[background-color,border-color,color,box-shadow,transform,opacity] " +
  "duration-200 ease-out select-none " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 " +
  "motion-reduce:transition-none";

const BTN_VARIANT = {
  primary:
    "bg-blue-600 text-white shadow-[0_0.5px_2px_rgba(15,23,42,0.10)] " +
    "hover:bg-blue-700 active:bg-blue-800 " +
    "disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none",
  secondary:
    "bg-white text-slate-800 border border-[#E2E8F0] " +
    "shadow-[0_0.5px_2px_rgba(15,23,42,0.06)] " +
    "hover:bg-slate-50 hover:border-slate-300 active:bg-slate-100 " +
    "disabled:bg-slate-50 disabled:text-slate-400 disabled:border-slate-200",
  ghost:
    "bg-transparent text-slate-700 " +
    "hover:bg-slate-100 active:bg-slate-200 " +
    "disabled:text-slate-400",
  danger:
    "bg-white text-red-600 border border-red-300 " +
    "hover:bg-red-50 active:bg-red-100 " +
    "disabled:bg-slate-50 disabled:text-slate-400 disabled:border-slate-200",
};

const BTN_SIZE = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  icon = null,
  onClick,
  children,
  type = "button",
  className = "",
  ...rest
}) {
  const isDisabled = disabled || loading;
  const pressable = !isDisabled && (variant === "primary" || variant === "secondary");

  const handleClick = (e) => {
    if (isDisabled) {
      e.preventDefault();
      return;
    }
    if (onClick) onClick(e);
  };

  return (
    <button
      type={type}
      onClick={handleClick}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={[
        BTN_BASE,
        BTN_VARIANT[variant] || BTN_VARIANT.primary,
        BTN_SIZE[size] || BTN_SIZE.md,
        isDisabled ? "cursor-not-allowed" : "cursor-pointer",
        pressable && !isDisabled ? "active:translate-y-px" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {loading ? (
        <IconSpinner size={16} className="animate-spin motion-reduce:animate-none" />
      ) : (
        icon
      )}
      <span>{children}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ Chip */

const CHIP_TONE = {
  brand: "bg-blue-50 text-blue-700",
  neutral: "bg-slate-100 text-slate-600",
  warn: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-600",
  success: "bg-emerald-50 text-emerald-700",
  accent: "bg-violet-50 text-violet-700",
};

export function Chip({ tone = "neutral", icon = null, children, className = "" }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-[6px] px-2 py-0.5 text-xs font-medium leading-5",
        CHIP_TONE[tone] || CHIP_TONE.neutral,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {icon}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ Card */

export function Card({
  title,
  extra = null,
  children,
  onClick,
  selected = false,
  className = "",
}) {
  const interactive = typeof onClick === "function";

  const common = [
    "relative block rounded-[12px] border bg-white p-4",
    "shadow-[0_0.5px_3px_rgba(15,23,42,0.06)]",
    "transition-[border-color,box-shadow,background-color] duration-200 ease-out",
    "motion-reduce:transition-none",
    selected
      ? "border-blue-200 bg-blue-50/40"
      : "border-[#E2E8F0]",
    interactive
      ? "cursor-pointer hover:border-blue-200 hover:shadow-[0_1px_6px_rgba(15,23,42,0.10)] " +
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45"
      : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const inner = (
    <>
      {selected && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-0 h-full w-[3px] rounded-l-[12px] bg-blue-600"
        />
      )}
      {(title || extra) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          {title ? (
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          ) : (
            <span />
          )}
          {extra ? <div className="flex-none">{extra}</div> : null}
        </div>
      )}
      {children}
    </>
  );

  if (interactive) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick(e);
          }
        }}
        className={common}
      >
        {inner}
      </div>
    );
  }

  return <div className={common}>{inner}</div>;
}

/* ------------------------------------------------------------ StatusPill */

const STATUS_MAP = {
  待办理: { icon: IconCircle, cls: "bg-blue-50 text-blue-700" },
  已办理: { icon: IconCheck, cls: "bg-emerald-50 text-emerald-700 line-through" },
  无需办理: { icon: IconMinus, cls: "bg-slate-100 text-slate-500" },
  待确认: { icon: IconAlert, cls: "bg-amber-50 text-amber-700" },
  已过期: { icon: IconClock, cls: "bg-slate-100 text-slate-500" },
  草稿: { icon: IconPencil, cls: "bg-slate-100 text-slate-600" },
  解析中: { icon: IconSpinner, cls: "bg-blue-50 text-blue-700" },
  解析失败: { icon: IconX, cls: "bg-red-50 text-red-600" },
};

export function StatusPill({ status, size = "md", className = "" }) {
  const conf = STATUS_MAP[status] || STATUS_MAP["待确认"];
  const Icon = conf.icon;
  const spin = status === "解析中";

  const sizeCls =
    size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs";

  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-[6px] font-medium leading-5",
        sizeCls,
        conf.cls,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Icon
        size={size === "sm" ? 12 : 14}
        className={spin ? "animate-spin motion-reduce:animate-none" : ""}
      />
      <span>{status}</span>
    </span>
  );
}

/* ----------------------------------------------------------- SectionTitle */

export function SectionTitle({ children, extra = null, className = "" }) {
  return (
    <div
      className={[
        "mt-8 mb-3 flex items-center justify-between gap-3",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <h2 className="text-[13px] font-bold tracking-wide text-[#64748B]">
        {children}
      </h2>
      {extra ? <div className="flex-none">{extra}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------- EmptyState */

export function EmptyState({ icon = null, title, description, action = null }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon ? (
        <div className="mb-4 text-slate-300" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-slate-400">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/* ----------------------------------------------------------------- Modal */

export function Modal({
  open,
  title,
  onClose,
  children,
  footer = null,
  width = 560,
}) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement;

    // 把焦点移到弹窗内第一个可聚焦元素，没有就聚焦面板本身
    const panel = panelRef.current;
    if (panel) {
      const focusable = panel.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      (focusable || panel).focus();
    }

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (onClose) onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (
        previouslyFocused &&
        typeof previouslyFocused.focus === "function"
      ) {
        previouslyFocused.focus();
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
    >
      <div
        className="absolute inset-0 bg-slate-900/40 transition-opacity duration-200 ease-out motion-reduce:transition-none"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title || "弹窗"}
        tabIndex={-1}
        style={{ maxWidth: width }}
        className="relative z-10 flex max-h-[86vh] w-full flex-col overflow-hidden rounded-[12px] border border-[#E2E8F0] bg-white shadow-[0_4px_24px_rgba(15,23,42,0.12)] outline-none"
      >
        <div className="flex flex-none items-center justify-between gap-3 border-b border-[#E2E8F0] px-5 py-3.5">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 motion-reduce:transition-none"
          >
            <IconX size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm text-slate-700">
          {children}
        </div>

        {footer ? (
          <div className="flex flex-none items-center justify-end gap-3 border-t border-[#E2E8F0] px-5 py-3.5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
