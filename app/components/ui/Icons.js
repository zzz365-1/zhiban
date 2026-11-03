"use client";

/**
 * 线性图标库。统一 size 默认 16，颜色用 currentColor，
 * 线条宽度 1.6，不用填充风格。不引第三方图标库。
 */

function Svg({ size = 16, children, className = "", ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      {children}
    </svg>
  );
}

export function IconCalendar({ size = 16, className = "", ...rest }) {
  return (
    <Svg size={size} className={className} {...rest}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3.5v3M16 3.5v3" />
    </Svg>
  );
}

export function IconClock({ size = 16, className = "", ...rest }) {
  return (
    <Svg size={size} className={className} {...rest}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v4.8l3 1.8" />
    </Svg>
  );
}

export function IconPin({ size = 16, className = "", ...rest }) {
  return (
    <Svg size={size} className={className} {...rest}>
      <path d="M12 21s6.2-5.3 6.2-10a6.2 6.2 0 0 0-12.4 0C5.8 15.7 12 21 12 21Z" />
      <circle cx="12" cy="11" r="2.3" />
    </Svg>
  );
}

export function IconFile({ size = 16, className = "", ...rest }) {
  return (
    <Svg size={size} className={className} {...rest}>
      <path d="M6 3.5h7.2L19 9.3V20a.5.5 0 0 1-.5.5H6a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Z" />
      <path d="M13 3.8V9.4h5.6" />
    </Svg>
  );
}

export function IconCheck({ size = 16, className = "", ...rest }) {
  return (
    <Svg size={size} className={className} {...rest}>
      <path d="M5 12.6 9.6 17 19 6.8" />
    </Svg>
  );
}

export function IconAlert({ size = 16, className = "", ...rest }) {
  return (
    <Svg size={size} className={className} {...rest}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.6v5.2" />
      <path d="M12 16.2v.01" />
    </Svg>
  );
}

export function IconArrowRight({ size = 16, className = "", ...rest }) {
  return (
    <Svg size={size} className={className} {...rest}>
      <path d="M4.5 12h15" />
      <path d="M13.6 6.2 19.5 12l-5.9 5.8" />
    </Svg>
  );
}

export function IconPlus({ size = 16, className = "", ...rest }) {
  return (
    <Svg size={size} className={className} {...rest}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function IconSearch({ size = 16, className = "", ...rest }) {
  return (
    <Svg size={size} className={className} {...rest}>
      <circle cx="11" cy="11" r="6.3" />
      <path d="M15.7 15.7 20 20" />
    </Svg>
  );
}

export function IconList({ size = 16, className = "", ...rest }) {
  return (
    <Svg size={size} className={className} {...rest}>
      <path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11" />
      <path d="M4.6 6.5h.01M4.6 12h.01M4.6 17.5h.01" />
    </Svg>
  );
}

export function IconHome({ size = 16, className = "", ...rest }) {
  return (
    <Svg size={size} className={className} {...rest}>
      <path d="M3.8 10.5 12 3.8l8.2 6.7" />
      <path d="M5.6 9.3v10.4h12.8V9.3" />
      <path d="M10 19.7v-4.6h4v4.6" />
    </Svg>
  );
}

export function IconRefresh({ size = 16, className = "", ...rest }) {
  return (
    <Svg size={size} className={className} {...rest}>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.8 3.9v4.2h-4.2" />
    </Svg>
  );
}

export function IconStar({ size = 16, className = "", ...rest }) {
  return (
    <Svg size={size} className={className} {...rest}>
      <path d="m12 3.9 2.5 5.1 5.6.8-4.1 4 1 5.6-5-2.6-5 2.6 1-5.6-4.1-4 5.6-.8Z" />
    </Svg>
  );
}

export function IconX({ size = 16, className = "", ...rest }) {
  return (
    <Svg size={size} className={className} {...rest}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function IconChevronDown({ size = 16, className = "", ...rest }) {
  return (
    <Svg size={size} className={className} {...rest}>
      <path d="M6 9.5 12 15l6-5.5" />
    </Svg>
  );
}

export function IconChevronRight({ size = 16, className = "", ...rest }) {
  return (
    <Svg size={size} className={className} {...rest}>
      <path d="M9.5 6 15 12l-5.5 6" />
    </Svg>
  );
}

export function IconChevronUp({ size = 16, className = "", ...rest }) {
  return (
    <Svg size={size} className={className} {...rest}>
      <path d="M6 14.5 12 9l6 5.5" />
    </Svg>
  );
}

export function IconPencil({ size = 16, className = "", ...rest }) {
  return (
    <Svg size={size} className={className} {...rest}>
      <path d="M4.5 19.5h4l9.4-9.4-4-4-9.4 9.4Z" />
      <path d="m13.9 4.1 2 2 2 2" />
    </Svg>
  );
}

export function IconSpinner({ size = 16, className = "", ...rest }) {
  return (
    <Svg size={size} className={className} {...rest}>
      <path d="M12 3.8a8.2 8.2 0 1 1-8.2 8.2" />
    </Svg>
  );
}

export function IconCircle({ size = 16, className = "", ...rest }) {
  return (
    <Svg size={size} className={className} {...rest}>
      <circle cx="12" cy="12" r="7.5" />
    </Svg>
  );
}

export function IconMinus({ size = 16, className = "", ...rest }) {
  return (
    <Svg size={size} className={className} {...rest}>
      <path d="M6 12h12" />
    </Svg>
  );
}

export function IconClose({ size = 16, className = "", ...rest }) {
  return (
    <Svg size={size} className={className} {...rest}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}
