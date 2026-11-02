/**
 * 023 盲测执行器（临时版）
 *
 * 作用：把 docs/blind-test-023.md 里的 20 条全新通知逐条喂给生产链路 parseOne，
 * 输出程序实际抽到的字段，供人工与 AI 判断逐条比对。
 *
 * 三条硬线：
 *   1. 直接 import 生产模块 parseOne，不另抄一份抽取逻辑（Dec-022）
 *   2. 只打印解析结果与费用，任何情况下不打印完整 Key
 *   3. 不修改盲测素材里的 AI 判断，比对不一致只记录不抹平（Dec-031）
 *
 * 用法：node scripts/blind-run-tmp.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// 加载本地密钥（只注入内存，不打印）
const envPath = join(root, ".env.local");
if (!existsSync(envPath)) {
  console.error("未找到 .env.local");
  process.exit(1);
}
const envText = readFileSync(envPath, "utf8");
const matched = envText.match(/^\s*DEEPSEEK_API_KEY\s*=\s*(.+?)\s*$/m);
if (!matched) {
  console.error(".env.local 里没有 DEEPSEEK_API_KEY");
  process.exit(1);
}
// parseOne 内部走的是 fetch("/api/parse")，那是浏览器相对地址。
// 纯 node 环境下解析不了，会把所有模型调用误判成失败（本机踩过一次，见日志）。
// 这里只补 URL 前缀，让它打到真实 dev server，parseOne 本身一行不改，链路保持同源。
const ORIGIN = process.env.BLIND_ORIGIN || "http://localhost:3000";
const origFetch = globalThis.fetch;
globalThis.fetch = (url, opts) => {
  if (typeof url === "string" && url.startsWith("/")) {
    return origFetch(ORIGIN + url, opts);
  }
  return origFetch(url, opts);
};

console.log("已把相对地址指向 " + ORIGIN + "（parseOne 本身未改动）");

const { parseOne } = await import("file:///D:/zhiban/app/lib/parseOne.js");

// 解析盲测素材
const raw = readFileSync(join(root, "docs/blind-test-023.md"), "utf8");
const parts = raw.split(/\*\*第(\d+)条\*\*/).slice(1);
const items = [];
for (let i = 0; i < parts.length; i += 2) {
  const body = parts[i + 1];
  const jIdx = body.indexOf("判断：");
  const notice = (jIdx >= 0 ? body.slice(0, jIdx) : body)
    .replace(/^---/m, "")
    .trim();
  const judge = jIdx >= 0 ? body.slice(jIdx).trim() : "";
  items.push({ num: Number(parts[i]), notice, judge });
}
console.log("盲测条数 " + items.length + "\n");

function pickJudge(judge, label) {
  const re = new RegExp("[-*]\\s*" + label + "[：:]\\s*(.+)");
  const m = judge.match(re);
  return m ? m[1].trim() : "";
}

const rows = [];
for (const it of items) {
  const r = await parseOne(it.notice);
  const a = r.analysis || r;
  rows.push({
    num: it.num,
    deadline: a.deadline || "",
    time: a.time || "",
    location: a.location || "",
    materials: Array.isArray(a.materials) ? a.materials.join("、") : a.materials || "",
    audience: a.audience || "",
    source: a._source || a.source || "",
    err: a._aiErrorCode || "",
    dropped: a._groundingDropped || "",
    judgeDeadline: pickJudge(it.judge, "截止日期"),
    judgeLocation: pickJudge(it.judge, "地点"),
    judgeMaterials: pickJudge(it.judge, "需要带的材料"),
  });
}

console.log("=== 程序实际输出 ===");
for (const r of rows) {
  console.log(
    "第" +
      String(r.num).padStart(2) +
      "条 | 来源:" +
      (r.source || "空").padEnd(6) +
      " | 日期:" +
      (r.deadline || "空").padEnd(12) +
      " | 时间:" +
      (r.time || "空").padEnd(10) +
      " | 地点:" +
      (r.location || "空").padEnd(14) +
      " | 材料:" +
      (r.materials || "空").padEnd(12) +
      " | 对象:" +
      (r.audience || "空")
  );
}

console.log("\n=== 与 AI 判断的日期比对 ===");
for (const r of rows) {
  console.log(
    "第" + String(r.num).padStart(2) + "条 程序[" + (r.deadline || "空") + "]  AI判断[" + (r.judgeDeadline || "空") + "]"
  );
}

console.log("\n=== 与 AI 判断的地点比对 ===");
for (const r of rows) {
  console.log(
    "第" + String(r.num).padStart(2) + "条 程序[" + (r.location || "空") + "]  AI判断[" + (r.judgeLocation || "空") + "]"
  );
}

const errRows = rows.filter((r) => r.err);
console.log("\n错误码统计 " + errRows.length + " 条");
for (const r of errRows) console.log("  第" + r.num + "条 " + r.err);

const dropRows = rows.filter((r) => r.dropped);
console.log("出处核对拦截 " + dropRows.length + " 条");
for (const r of dropRows) console.log("  第" + r.num + "条 " + JSON.stringify(r.dropped));
