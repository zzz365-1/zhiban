"use client";

import { useEffect, useState } from "react";
import { StatusPill, Button, EmptyState, Modal } from "./ui/ZbUI.js";
import { IconList, IconSpinner } from "./ui/Icons.js";

/**
 * 通知详情容器。
 * 左栏放原文（可折叠、可独立查看），右栏渲染主页面传进来的详情面板，
 * 让用户在宽屏上能左右对照原文和解析结果。
 */
export default function NoticeDetail({
  status,
  text,
  onTextChange,
  readOnly = false,
  noticeTitle = "",
  sourceLabel = "",
  analysis = null,
  dirty = false,
  parsing = false,
  onReparse,
  onSave,
  canSave = false,
  saveLabel = "保存",
  onDelete,
  children,
}) {
  // 折叠状态只在这一层记，默认展开
  const [collapsed, setCollapsed] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  // 原文框跟随内容自适应高度：短内容整段展开，长内容由上层滚动容器滚
  useEffect(() => {
    const el = document.getElementById("notice-text");
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text, collapsed]);

  const isEmpty = !text && !analysis;

  // 解析中：主体位置只显示加载提示，不显示任何假进度
  if (parsing) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center">
        <IconSpinner
          size={28}
          className="animate-spin text-blue-600 motion-reduce:animate-none"
        />
        <div className="mt-3 text-[13px] text-[#64748B]">正在解析</div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ---------------- 顶部状态栏 ---------------- */}
      <div className="flex h-[60px] flex-none items-center justify-between gap-4 border-b border-[#E2E8F0] bg-white px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex-none">
            <StatusPill status={status} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[16px] font-bold text-[#0F172A]">
              {noticeTitle || "未命名通知"}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-[#64748B]">
              {sourceLabel ? <span>{sourceLabel}</span> : null}
              {sourceLabel === "示例" ? (
                <span className="rounded-[4px] bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-[#7C3AED]">
                  示例数据
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-none items-center gap-2">
          {dirty ? (
            <span className="text-[12px] text-amber-600">
              内容已修改，待重新解析
            </span>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            disabled={parsing}
            onClick={onReparse}
          >
            重新解析
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!canSave}
            onClick={onSave}
          >
            {saveLabel}
          </Button>
          {onDelete ? (
            <Button variant="danger" size="sm" onClick={onDelete}>
              删除
            </Button>
          ) : null}
        </div>
      </div>

      {/* ---------------- 主体 ---------------- */}
      {isEmpty ? (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-[#F5F7FB]">
          <EmptyState
            icon={<IconList size={40} />}
            title="还没有内容"
            description="点上方的新增通知，粘贴一条校园通知，解析之后这里会显示要做什么。"
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* 上区：原文（按内容自适应高度，过长时自身可滚） */}
          {collapsed ? (
            <div className="flex flex-none items-center justify-between gap-2 border-b border-[#E2E8F0] bg-white px-4 py-2">
              <span className="text-[13px] font-bold tracking-wide text-[#64748B]">
                通知原文
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCollapsed(false)}
              >
                展开
              </Button>
            </div>
          ) : (
            <div className="flex max-h-[40%] min-h-0 flex-none flex-col overflow-y-auto border-b border-[#E2E8F0] bg-white">
              <div className="sticky top-0 z-10 flex flex-none items-center justify-between gap-2 border-b border-[#E2E8F0] bg-white px-4 py-2">
                <span className="text-[13px] font-bold text-[#64748B]">
                  通知原文
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setCollapsed(true)}
                  >
                    折叠
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowRaw(true)}
                  >
                    独立查看
                  </Button>
                </div>
              </div>
              <div className="flex-none px-4 pb-4">
                {/* 编号不能改：现有高亮功能靠它定位文本域 */}
                <textarea
                  id="notice-text"
                  value={text}
                  onChange={(e) => onTextChange && onTextChange(e.target.value)}
                  readOnly={readOnly}
                  className={[
                    "zb-input block w-full resize-none overflow-hidden leading-[1.8]",
                    readOnly ? "bg-slate-50" : "bg-white",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
              </div>
            </div>
          )}

          {/* 下区：详情面板（占满剩余高度，自身可滚） */}
          <div className="min-h-0 flex-1 overflow-y-auto bg-[#F5F7FB] px-5 pt-3 pb-5">
            {children}
          </div>
        </div>
      )}

      {/* 独立查看原文弹窗 */}
      <Modal
        open={showRaw}
        title="通知原文"
        width={880}
        onClose={() => setShowRaw(false)}
      >
        <div className="max-h-[60vh] overflow-y-auto rounded-[10px] border border-[#E2E8F0] bg-white p-5 text-[14px] leading-[1.8] whitespace-pre-wrap text-[#0F172A]">
          {text}
        </div>
      </Modal>
    </div>
  );
}
