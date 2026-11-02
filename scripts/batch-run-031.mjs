/**
 * 031 大批量真实链路测试执行器
 *
 * 作用：把 docs/batch-test-031.md 里的通知逐条喂给生产链路 parseOne，
 * 同时做不依赖期望值的自动检查，产出人在手机上能直接看的 HTML 报告。
 *
 * 五条硬线：
 *   1. 直接 import 生产模块 parseOne，不另抄一份抽取逻辑（Dec-022）
 *   2. 不打印、不输出任何密钥
 *   3. 不修改素材里的判断，比对不一致只记录不抹平（Dec-031）
 *   4. 自动检查不看期望值，只看值本身是否站得住（出处、可解析、稳定性）
 *   5. 扫到零条素材必须报错，不许把零覆盖渲染成通过（Dec-043）
 *
 * 用法：
 *   node scripts/batch-run-031.mjs           跑一遍
 *   node scripts/batch-run-031.mjs --twice   每条跑两遍，额外做稳定性检查
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "docs", "batch-test-031.md");
const OUT_MD = join(root, "docs", "batch-report-031.md");
const OUT_HTML = join(root, "docs", "batch-report-031.html");
const TWICE = process.argv.includes("--twice");

// parseOne 内部走的是 fetch("/api/parse")，浏览器相对地址在纯 node 下解析不了。
// 这里只补 URL 前缀，parseOne 本身一行不改，链路保持同源（Dec-022）。
const ORIGIN = process.env.BLIND_ORIGIN || "http://localhost:3000";
const origFetch = globalThis.fetch;
globalThis.fetch = (url, opts) => {
  if (typeof url === "string" && url.startsWith("/")) {
    return origFetch(ORIGIN + url, opts);
  }
  return origFetch(url, opts);
};

const { parseOne } = await import("file:///D:/zhiban/app/lib/parseOne.js");
const { parseUserDateInput } = await import("file:///D:/zhiban/app/lib/deadline.js");

// ---------- 解析素材 ----------
const raw = readFileSync(SRC, "utf8");
const parts = raw.split(/\*\*第(\d+)条\*\*/).slice(1);
const items = [];
for (let i = 0; i < parts.length; i += 2) {
  const body = parts[i + 1];
  const jIdx = body.indexOf("判断：");
  const notice = (jIdx >= 0 ? body.slice(0, jIdx) : body).replace(/^---/m, "").trim();
  const judge = jIdx >= 0 ? body.slice(jIdx).trim() : "";
  items.push({ num: Number(parts[i]), notice, judge });
}

if (items.length === 0) {
  console.error("素材解析出 0 条，脚本不会假装通过（Dec-043）");
  process.exit(1);
}
console.log("素材条数 " + items.length + (TWICE ? "，每条跑两遍" : ""));

function pickJudge(judge, label) {
  const m = judge.match(new RegExp("[-*]\\s*" + label + "[：:]\\s*(.+)"));
  return m ? m[1].trim() : "";
}

// ---------- 自动检查（不依赖期望值） ----------
function norm(s) {
  return String(s).replace(/\s/g, "");
}

function checkTime(value, notice) {
  // 时间字段会被归一化成 24 小时制，比如下午5点变成 17:00。
  // 这是有意的行为不是编造，所以不能拿子串匹配去判它，
  // 否则会把十几条正常结果全染红，比不检查还危险（Dec-038）。
  // 这里把 24 小时制反推回中文说法，再回原文找。
  const n = norm(value);
  if (!n) return null;
  if (norm(notice).includes(n)) return null;

  const m = String(value).trim().match(/^([0-9]{1,2}):([0-9]{2})$/);
  if (!m) return "原文中找不到";
  const hh = Number(m[1]);
  const mm = m[2];
  const cands = [hh + "点", hh + "时", hh + ":" + mm];
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  if (hh >= 12) cands.push("下午" + h12 + "点", "下午" + h12, "晚上" + h12 + "点");
  else cands.push("上午" + hh + "点", "上午" + hh, "早上" + hh + "点");
  if (hh === 12) cands.push("中午" + hh + "点", "中午12点");
  if (mm !== "00") cands.push(hh + "点" + Number(mm));
  for (const c of cands) {
    if (norm(notice).includes(norm(c))) return null;
  }
  return "原文中找不到对应时间";
}

function checkGrounding(value, notice) {
  // 值必须能在原文里找到出处。找不到就是模型编的，或者规则切歪了。
  const n = norm(value);
  if (!n) return null;
  return norm(notice).includes(n) ? null : "原文中找不到";
}

function checkDate(deadline) {
  if (!deadline) return null;
  const p = parseUserDateInput(deadline, new Date(2026, 10, 2));
  return p ? null : "无法转成具体日期";
}

function diffLabel(actual, judge) {
  if (!judge || judge === "空") return actual && actual !== "空" ? "程序有值，人工判空" : null;
  if (!actual) return "程序为空，人工判有值";
  const a = norm(actual);
  const b = norm(judge);
  if (a === b) return null;
  if (a.includes(b) || b.includes(a)) return "部分一致（" + actual + " 对 " + judge + "）";
  return "不一致（" + actual + " 对 " + judge + "）";
}

// ---------- 跑 ----------
const rows = [];
let aiCalls = 0;
let failed = 0;
const t0 = Date.now();

for (const it of items) {
  const start = Date.now();
  const r = await parseOne(it.notice);
  const a = r.analysis || {};
  const ms = Date.now() - start;

  const second = TWICE ? (await parseOne(it.notice)).analysis || {} : null;

  const src = a._source || "";
  if (src !== "rule") aiCalls += 1;
  if (a._aiErrorCode) failed += 1;

  const issues = [];
  const dIssue = checkDate(a.deadline);
  if (dIssue) issues.push("日期：" + dIssue);
  if (a.location) {
    const g = checkGrounding(a.location, it.notice);
    if (g) issues.push("地点：" + g);
  }
  if (a.time) {
    const g = checkTime(a.time, it.notice);
    if (g) issues.push("时间：" + g);
  }
  if (a.audience) {
    const g = checkGrounding(a.audience, it.notice);
    if (g) issues.push("对象：" + g);
  }
  if (Array.isArray(a.materials)) {
    for (const m of a.materials) {
      const g = checkGrounding(m, it.notice);
      if (g) issues.push("材料：" + m + " " + g);
    }
  }
  if (a._aiErrorCode) issues.push("模型调用失败：" + a._aiErrorCode);
  if (a._groundingDropped && Object.keys(a._groundingDropped).length > 0) {
    issues.push("出处核对剔除：" + JSON.stringify(a._groundingDropped));
  }

  // 稳定性：同一条跑两遍，结果不一样就说明模型输出不可复现（Dec-036）
  if (second) {
    for (const k of ["deadline", "time", "location", "audience", "title"]) {
      const v1 = Array.isArray(a[k]) ? a[k].join("、") : a[k] || "";
      const v2 = Array.isArray(second[k]) ? second[k].join("、") : second[k] || "";
      if (v1 !== v2) issues.push("两遍不一致：" + k + " 第一遍[" + v1 + "] 第二遍[" + v2 + "]");
    }
  }

  rows.push({
    num: it.num,
    notice: it.notice,
    title: a.title || "",
    deadline: a.deadline || "",
    time: a.time || "",
    location: a.location || "",
    materials: Array.isArray(a.materials) ? a.materials.join("、") : a.materials || "",
    audience: a.audience || "",
    category: a.category || "",
    summary: a.summary || "",
    source: src,
    ms,
    issues,
    judgeDeadline: pickJudge(it.judge, "截止日期"),
    judgeLocation: pickJudge(it.judge, "地点"),
    dateDiff: diffLabel(a.deadline || "", pickJudge(it.judge, "截止日期")),
    locDiff: diffLabel(a.location || "", pickJudge(it.judge, "地点")),
  });
  process.stdout.write("第" + it.num + "条 ");
}

const total = Date.now() - t0;
console.log("\n总耗时 " + (total / 1000).toFixed(1) + " 秒，调模型 " + aiCalls + " 条，失败 " + failed + " 条");

// ---------- 统计 ----------
const withIssues = rows.filter((r) => r.issues.length > 0);
const hardIssues = rows.filter((r) => r.issues.some((s) => !s.startsWith("出处核对剔除")));
const dropped = rows.filter((r) => r.issues.some((s) => s.startsWith("出处核对剔除")));
const dateDiffRows = rows.filter((r) => r.dateDiff);
const locDiffRows = rows.filter((r) => r.locDiff);
const emptyDeadline = rows.filter((r) => !r.deadline);
const emptyLocation = rows.filter((r) => !r.location);
const avgMs = Math.round(rows.reduce((s, r) => s + r.ms, 0) / rows.length);

// ---------- Markdown 存档 ----------
let md = "# 031 大批量真实链路测试报告\n\n";
md += "素材 " + items.length + " 条，基准日 2026年11月2日" + (TWICE ? "，每条跑两遍" : "") + "。\n\n";
md += "| 指标 | 数值 |\n|---|---|\n";
md += "| 总耗时 | " + (total / 1000).toFixed(1) + " 秒 |\n";
md += "| 调模型条数 | " + aiCalls + " / " + items.length + " |\n";
md += "| 模型调用失败 | " + failed + " |\n";
md += "| 单条平均耗时 | " + avgMs + " 毫秒 |\n";
md += "| 有自动检查问题 | " + hardIssues.length + " 条 |\n";
md += "| 出处核对剔除过值 | " + dropped.length + " 条 |\n";
md += "| 日期与人工判断有差异 | " + dateDiffRows.length + " 条 |\n";
md += "| 地点与人工判断有差异 | " + locDiffRows.length + " 条 |\n";
md += "| 日期为空 | " + emptyDeadline.length + " 条 |\n";
md += "| 地点为空 | " + emptyLocation.length + " 条 |\n\n";
md += "## 逐条结果\n\n";
for (const r of rows) {
  md +=
    "第" + r.num + "条 来源:" + (r.source || "空") + " 耗时:" + r.ms + "毫秒\n" +
    "  日期:" + (r.deadline || "空") + " 时间:" + (r.time || "空") + " 地点:" + (r.location || "空") + "\n" +
    "  材料:" + (r.materials || "空") + " 对象:" + (r.audience || "空") + " 分类:" + (r.category || "空") + "\n";
  if (r.dateDiff) md += "  日期差异 " + r.dateDiff + "\n";
  if (r.locDiff) md += "  地点差异 " + r.locDiff + "\n";
  for (const s of r.issues) md += "  [问题] " + s + "\n";
  md += "\n";
}
writeFileSync(OUT_MD, md, "utf8");

// ---------- HTML 报告（手机可看） ----------
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}
const rowsHtml = rows
  .map((r) => {
    const bad = r.issues.some((s) => !s.startsWith("出处核对剔除"));
    const cls = bad ? "bad" : "";
    return (
      '<tr class="' + cls + '">' +
      '<td class="num">' + r.num + "</td>" +
      '<td class="notice">' + esc(r.notice).replace(/\n/g, "<br>") + "</td>" +
      "<td>" + esc(r.deadline || "-") + (r.dateDiff ? '<div class="diff">' + esc(r.dateDiff) + "</div>" : "") + "</td>" +
      "<td>" + esc(r.time || "-") + "</td>" +
      "<td>" + esc(r.location || "-") + (r.locDiff ? '<div class="diff">' + esc(r.locDiff) + "</div>" : "") + "</td>" +
      "<td>" + esc(r.materials || "-") + "</td>" +
      "<td>" + esc(r.audience || "-") + "</td>" +
      "<td>" + esc(r.category || "-") + "</td>" +
      '<td class="src">' + esc(r.source || "-") + "<div class='ms'>" + r.ms + "ms</div></td>" +
      "<td>" +
      (r.issues.length === 0
        ? '<span class="ok">通过</span>'
        : r.issues.map((s) => '<div class="' + (s.startsWith("出处核对剔除") ? "warn" : "err") + '">' + esc(s) + "</div>").join("")) +
      "</td>" +
      "</tr>"
    );
  })
  .join("\n");

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>知办 大批量测试报告</title>
<style>
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; margin:0; background:#f6f7f9; color:#1a1a1a; font-size:14px; }
  .wrap { padding:14px; }
  h1 { font-size:19px; margin:0 0 4px; }
  .sub { color:#6b7280; font-size:12px; margin-bottom:14px; }
  .cards { display:grid; grid-template-columns:repeat(2,1fr); gap:8px; margin-bottom:16px; }
  .card { background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:10px 12px; }
  .card b { display:block; font-size:20px; line-height:1.2; }
  .card span { font-size:12px; color:#6b7280; }
  .card.red b { color:#c62828; }
  table { width:100%; border-collapse:collapse; background:#fff; font-size:12px; }
  th, td { border:1px solid #e5e7eb; padding:6px 8px; text-align:left; vertical-align:top; }
  th { background:#eef1f5; font-weight:600; position:sticky; top:0; }
  tr.bad td { background:#fff5f5; }
  td.num { font-weight:600; width:28px; }
  td.notice { max-width:230px; color:#374151; line-height:1.5; }
  td.src { font-size:11px; color:#6b7280; }
  .ms { color:#9ca3af; }
  .ok { color:#2e7d32; }
  .err { color:#c62828; line-height:1.4; }
  .warn { color:#b26a00; line-height:1.4; }
  .diff { color:#b26a00; font-size:11px; margin-top:3px; }
  .note { background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:12px; margin-bottom:14px; font-size:12px; line-height:1.7; color:#374151; }
  @media (max-width:640px){ .cards{grid-template-columns:repeat(2,1fr);} }
</style>
</head>
<body>
<div class="wrap">
  <h1>知办 · 大批量真实链路测试</h1>
  <div class="sub">${items.length} 条通知 · 基准日 2026年11月2日${TWICE ? " · 每条跑两遍" : ""} · 走生产链路 parseOne</div>
  <div class="cards">
    <div class="card"><b>${items.length}</b><span>测试条数</span></div>
    <div class="card"><b>${avgMs}ms</b><span>单条平均耗时</span></div>
    <div class="card"><b>${aiCalls}</b><span>调用模型条数</span></div>
    <div class="card"><b>${failed}</b><span>模型失败</span></div>
    <div class="card ${hardIssues.length ? "red" : ""}"><b>${hardIssues.length}</b><span>自动检查报问题</span></div>
    <div class="card"><b>${dropped.length}</b><span>出处核对剔除过值</span></div>
    <div class="card ${dateDiffRows.length ? "red" : ""}"><b>${dateDiffRows.length}</b><span>日期与人工判断有差异</span></div>
    <div class="card ${locDiffRows.length ? "red" : ""}"><b>${locDiffRows.length}</b><span>地点与人工判断有差异</span></div>
  </div>
  <div class="note">
    自动检查不看期望值，只看值本身站不站得住：日期能不能转成具体日期，地点时间对象材料能不能在原文里找到出处，
    模型有没有调用失败，同一条跑两遍结果一不一样。<br>
    橙色「与人工判断有差异」不等于程序错，是口径分歧或需要人裁断的地方，逐条看原文再定谁对。
  </div>
  <table>
    <thead><tr><th>#</th><th>通知原文</th><th>截止日期</th><th>时间</th><th>地点</th><th>材料</th><th>对象</th><th>分类</th><th>来源</th><th>检查</th></tr></thead>
    <tbody>
${rowsHtml}
    </tbody>
  </table>
</div>
</body>
</html>`;
writeFileSync(OUT_HTML, html, "utf8");

console.log("已写出 " + OUT_MD + " 与 " + OUT_HTML);
console.log("自动检查报问题 " + hardIssues.length + " 条，日期差异 " + dateDiffRows.length + " 条，地点差异 " + locDiffRows.length + " 条");
