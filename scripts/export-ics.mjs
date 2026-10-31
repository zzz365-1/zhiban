/**
 * 终端导出 ICS
 * 用法：
 *   node scripts/export-ics.mjs "通知原文"
 *   node scripts/export-ics.mjs "通知原文" --out my.ics
 *
 * 只做规则解析，不调用大模型。
 * 如果原文里的日期是模糊写法（本月底、下周三等）或根本没有日期，
 * 命令会报错退出，不会生成假文件。
 */

import { writeFileSync, existsSync, statSync } from "node:fs";
import { extractNotice } from "../app/lib/extractNotice.js";
import { buildDeadlineDate } from "../app/lib/deadline.js";
import { generateDeadlineICS } from "../app/lib/generateICS.js";

const LF = String.fromCharCode(10);
const args = process.argv.slice(2);

let outFile = "zhiban-deadline.ics";
const textParts = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out" && args[i + 1]) {
    outFile = args[i + 1];
    i++;
  } else {
    textParts.push(args[i]);
  }
}

const text = textParts.join(" ").trim();

if (!text) {
  console.error(
    '用法：node scripts/export-ics.mjs "通知原文" [--out 文件名.ics]'
  );
  process.exit(1);
}

const analysis = extractNotice(text);
const date = buildDeadlineDate(analysis.deadline, analysis.time);

if (!date) {
  console.error("无法确定截止日期，未生成文件。");
  console.error("解析结果：");
  console.error("  deadline: " + (analysis.deadline || "(空)"));
  console.error("  time: " + (analysis.time || "(空)"));
  console.error(
    "原文中的日期可能是模糊写法（本月底、下周三等），或根本没有日期。"
  );
  process.exit(1);
}

// 标题取原文第一行非空文本，超过 30 字截断
let title = "通知截止提醒";
for (const line of text.split(LF)) {
  const t = line.trim();
  if (t) {
    title = t.length > 30 ? t.slice(0, 30) + "…" : t;
    break;
  }
}

const descriptionParts = [];
if (analysis.location) descriptionParts.push("地点：" + analysis.location);
if (analysis.materials && analysis.materials.length) {
  descriptionParts.push("材料：" + analysis.materials.join("、"));
}
if (analysis.audience) descriptionParts.push("对象：" + analysis.audience);

const ics = generateDeadlineICS({
  title,
  deadlineDate: date,
  location: analysis.location || "",
  description: descriptionParts.join(LF),
});

writeFileSync(outFile, ics, "utf8");

const pad = (n) => String(n).padStart(2, "0");
const timeStr =
  date.getFullYear() +
  "-" +
  pad(date.getMonth() + 1) +
  "-" +
  pad(date.getDate()) +
  " " +
  pad(date.getHours()) +
  ":" +
  pad(date.getMinutes());

// 读回文件确认真的写入了内容
const size = existsSync(outFile) ? statSync(outFile).size : 0;

if (size === 0) {
  console.error("写入失败：文件大小为 0 字节。");
  process.exit(1);
}

console.log("已生成：" + outFile);
console.log("文件大小：" + size + " 字节");
console.log("截止时间：" + timeStr);
console.log("提醒：截止前一天");