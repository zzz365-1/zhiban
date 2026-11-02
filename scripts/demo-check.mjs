/**
 * 演示素材自检
 *
 * 作用：把 docs/demo-notices.md 里的通知在演示前先跑一遍，
 * 确认每一条还能抽出截止日期或者活动日期，不会现场翻车。
 *
 * 三条硬线：
 *   1. 直接 import 生产模块，不另抄一份抽取逻辑（Dec-022）
 *   2. 默认只走本地规则，零网络零密钥，演示前一秒也能跑（Dec-043 零覆盖要报错）
 *   3. 加了 --ai 才走完整链路，此时需要 npm run dev 已经起在 3000 端口
 *
 * 用法：
 *   node scripts/demo-check.mjs         只跑本地规则
 *   node scripts/demo-check.mjs --ai    走完整链路（含模型）
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(join(root, "docs", "demo-notices.md"), "utf8");
const blocks = [...raw.matchAll(/```text\r?\n([\s\S]*?)```/g)].map((m) =>
  m[1].replace(/\r/g, "").trim()
);

if (blocks.length === 0) {
  console.error("一条素材都没读到，脚本不会假装通过（Dec-043）");
  process.exit(1);
}

const WITH_AI = process.argv.includes("--ai");
const NOW = new Date();

let parseOne = null;
let splitNotices = null;
const { extractNotice } = await import("file:///D:/zhiban/app/lib/extractNotice.js");
const { resolveRelativeDate } = await import(
  "file:///D:/zhiban/app/lib/relativeDate.js"
);

if (WITH_AI) {
  const ORIGIN = process.env.BLIND_ORIGIN || "http://localhost:3000";
  const origFetch = globalThis.fetch;
  globalThis.fetch = (url, opts) =>
    typeof url === "string" && url.startsWith("/")
      ? origFetch(ORIGIN + url, opts)
      : origFetch(url, opts);
  parseOne = (await import("file:///D:/zhiban/app/lib/parseOne.js")).parseOne;
  splitNotices = (await import("file:///D:/zhiban/app/lib/splitNotices.js"))
    .splitNotices;
}

function rulePath(text) {
  const r = extractNotice(text);
  if (r.deadline) {
    const res = resolveRelativeDate(r.deadline, NOW);
    if (res) r.deadline = res.normalized;
  }
  if (r.eventDate) {
    const res = resolveRelativeDate(r.eventDate, NOW);
    if (res) r.eventDate = res.normalized;
  }
  return r;
}

function line(tag, a) {
  const bits = [];
  bits.push("截止 " + (a.deadline || "空") + " " + (a.time || "空"));
  if (a.eventDate || a.eventTime) {
    bits.push("活动 " + (a.eventDate || "空") + " " + (a.eventTime || "空"));
  }
  bits.push("地点 " + (a.location || "空"));
  bits.push(
    "材料 " + ((a.materials && a.materials.join("、")) || "空")
  );
  bits.push("对象 " + (a.audience || "空"));
  bits.push("分类 " + (a.category || "空"));
  bits.push("来源 " + (a._source || "rule"));
  console.log("  " + tag.padEnd(14) + bits.join(" | "));
}

let weak = 0;
for (let i = 0; i < blocks.length; i++) {
  const text = blocks[i];
  const isMulti = text.split(/\n\s*\n/).length >= 2;
  console.log("第" + (i + 1) + "段" + (isMulti ? "（多通知）" : ""));
  if (isMulti && WITH_AI) {
    const sp = splitNotices(text);
    console.log("  切分 " + (sp.ok ? "成功" : "失败") + " 条数 " + (sp.items ? sp.items.length : 0));
    for (const it of sp.items || []) {
      const a = (await parseOne(it)).analysis;
      line(it.split("\n")[0].slice(0, 12), a);
      if (!a.deadline && !a.eventDate) weak++;
    }
  } else if (isMulti) {
    for (const it of text.split(/\n\s*\n/)) {
      const a = rulePath(it.trim());
      line(it.trim().split("\n")[0].slice(0, 12), a);
      if (!a.deadline && !a.eventDate) weak++;
    }
  } else {
    const a = WITH_AI ? (await parseOne(text)).analysis : rulePath(text);
    line(text.split("\n")[0].slice(0, 12), a);
    if (!a.deadline && !a.eventDate) weak++;
  }
}

console.log(
  "\n共 " +
    blocks.length +
    " 段，日期和地点全空的有 " +
    weak +
    " 条" +
    (WITH_AI ? "（完整链路）" : "（本地规则，零网络）")
);
console.log(weak === 0 ? "演示素材没问题" : "提示：上面这些条演示时会显得空，先想好怎么讲");
