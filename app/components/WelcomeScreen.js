"use client";

import { useRouter } from "next/navigation";
import { buildSampleNotices } from "../lib/sampleNotices.js";
import { buildRouteEvents } from "../lib/routeEvents.js";
import { Button, Chip } from "./ui/ZbUI.js";
import { IconArrowRight } from "./ui/Icons.js";

const WELCOMED_KEY = "zhiban.welcomed";
const NOTICES_KEY = "zhiban.notices.v1";

function formatEventTime(ts) {
  const d = new Date(ts);
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return mm + "月" + dd + "日 " + hh + ":" + mi;
}

export default function WelcomeScreen() {
  const router = useRouter();

  // 预览数据在渲染时用当前时间算出，不依赖浏览器接口，可在服务端预渲染时执行
  const sampleNotices = buildSampleNotices(Date.now());
  const events = buildRouteEvents(sampleNotices).slice(0, 3);

  const handleEnter = () => {
    try {
      window.localStorage.setItem(WELCOMED_KEY, "1");
    } catch (e) {
      // 本地存储不可用时忽略，仍然允许进入工作台
    }
    router.push("/");
  };

  const handleTrySample = () => {
    let existing = [];
    try {
      const raw = window.localStorage.getItem(NOTICES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) existing = parsed;
      }
    } catch (e) {
      existing = [];
    }

    let samples = [];
    try {
      const built = buildSampleNotices(Date.now());
      if (Array.isArray(built)) samples = built;
    } catch (e) {
      samples = [];
    }

    const existingIds = new Set(
      existing
        .map((n) => (n && n.id != null ? n.id : null))
        .filter((id) => id != null)
    );

    const toInsert = samples.filter(
      (n) => n && (n.id == null || !existingIds.has(n.id))
    );

    const merged = toInsert.concat(existing);

    try {
      window.localStorage.setItem(NOTICES_KEY, JSON.stringify(merged));
      window.localStorage.setItem(WELCOMED_KEY, "1");
    } catch (e) {
      // 写入失败时静默处理，避免阻塞跳转
    }

    router.push("/");
  };

  return (
    <main
      className="relative min-h-screen w-full overflow-hidden"
      style={{
        background:
          "linear-gradient(180deg, #F5F7FB 0%, #EEF3FC 60%, #E8F0FB 100%)",
      }}
    >
      {/* 静止的极细装饰横线 */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute left-0 right-0 top-[18%] h-px bg-slate-200/50" />
        <div className="absolute left-0 right-0 top-[42%] h-px bg-slate-200/40" />
        <div className="absolute left-0 right-0 top-[66%] h-px bg-slate-200/50" />
        <div className="absolute left-0 right-0 top-[88%] h-px bg-slate-200/40" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1100px] flex-col px-6 py-12 md:px-8 md:py-16">
        <div className="grid flex-1 grid-cols-1 items-center gap-12 md:grid-cols-2 md:gap-10">
          {/* 品牌区 */}
          <div className="max-w-xl">
            <div
              className="zb-enter flex h-12 w-12 items-center justify-center rounded-[10px] bg-[#0F172A] text-base font-bold text-white"
              style={{ animationDelay: "0ms" }}
            >
              知办
            </div>

            <h1
              className="zb-enter mt-6 text-[52px] font-extrabold leading-none tracking-tight text-[#0F172A]"
              style={{ animationDelay: "80ms" }}
            >
              知办
            </h1>

            <p
              className="zb-enter mt-5 text-[20px] font-medium text-[#64748B]"
              style={{ animationDelay: "160ms" }}
            >
              把校园通知变成清晰行动
            </p>

            <p
              className="zb-enter mt-4 max-w-md text-[15px] leading-relaxed text-[#64748B]"
              style={{ animationDelay: "240ms" }}
            >
              把群里、公众号、教务系统里散落的校园通知粘贴进来，自动理出截止日期、地点和要交的材料，变成一条一条能照着做的事。
            </p>

            <div
              className="zb-enter mt-8 flex flex-wrap items-center gap-3"
              style={{ animationDelay: "320ms" }}
            >
              <Button
                variant="primary"
                size="md"
                icon={<IconArrowRight size={16} />}
                onClick={handleEnter}
                className="h-11 px-6 text-sm"
              >
                进入工作台
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={handleTrySample}
                className="h-11 px-6 text-sm"
              >
                体验示例
              </Button>
            </div>

            <p
              className="zb-enter mt-4 text-xs text-[#94A3B8]"
              style={{ animationDelay: "400ms" }}
            >
              示例通知会明确标注为示例，和你自己保存的通知分开存放。
            </p>
          </div>

          {/* 真实界面预览 */}
          <div className="zb-enter" style={{ animationDelay: "480ms" }}>
            <div className="rounded-[16px] border border-[#E2E8F0] bg-white p-5 shadow-[0_4px_16px_rgba(15,23,42,0.08)]">
              <div className="mb-4 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-slate-200" />
                <span className="h-2 w-2 rounded-full bg-slate-200" />
                <span className="h-2 w-2 rounded-full bg-slate-200" />
                <span className="ml-2 text-xs font-medium text-[#64748B]">
                  办理路线预览
                </span>
              </div>

              <div className="flex flex-col gap-3">
                {events.map((ev) => (
                  <div
                    key={ev.noticeId + "-" + ev.itemIndex}
                    className="relative rounded-[12px] border border-[#E2E8F0] bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)]"
                  >
                    <div className="absolute right-3 top-3">
                      <Chip tone="accent">示例预览</Chip>
                    </div>

                    <h3 className="pr-20 text-sm font-semibold text-[#0F172A]">
                      {ev.name || "未命名事项"}
                    </h3>

                    <dl className="mt-3 space-y-1.5 text-[13px] text-[#64748B]">
                      <div className="flex gap-2">
                        <dt className="flex-none text-slate-400">何时</dt>
                        <dd className="text-slate-700">
                          {formatEventTime(ev.ts)}
                        </dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="flex-none text-slate-400">去哪</dt>
                        <dd>{ev.location || "—"}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="flex-none text-slate-400">准备</dt>
                        <dd>
                          {Array.isArray(ev.materials) && ev.materials.length > 0
                            ? ev.materials.join("、")
                            : "—"}
                        </dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <p className="mt-10 text-center text-[11px] text-[#94A3B8]">
          数据是示例数据，只用于演示。
        </p>
      </div>
    </main>
  );
}
