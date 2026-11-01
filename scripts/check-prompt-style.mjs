/**
 * 校验 prompts/ 下所有归档文档的 Prompt 正文是否符合书写约束。
 *
 * 按「## Prompt」标题之后的第一个代码块定位 Prompt 正文，
 * 不能用 split 取第一个代码块——历史上有三份文档在背景里放了
 * 终端输出或 diff，导致取块错位（Dec-033 第三次踩到）。
 *
 * 允许的字符：汉字、ASCII 字母数字、空格、换行、中文逗号句号问号。
 * 注意：中文引号「」自 2026-11-01 起也列入禁用，示例文本要靠口语自然嵌入句子，
 *      不再靠引号标注边界。此前一直当作例外，是规则记错了。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ALLOWED = new Set(["，", "。", "？"]);

function isAllowed(ch) {
  if (ALLOWED.has(ch)) return true;
  const o = ch.codePointAt(0);
  if (o >= 0x4e00 && o <= 0x9fff) return true;
  if (ch === "\n" || ch === " ") return true;
  return /[A-Za-z0-9]/.test(ch);
}

function extractPrompt(md) {
  const at = md.indexOf("## Prompt");
  if (at < 0) return null;
  const rest = md.slice(at);
  const m = rest.match(/```[a-z]*\n([\s\S]*?)```/);
  return m ? m[1] : null;
}

const dir = "prompts";
const files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();

let totalBad = 0;
let checked = 0;
const offenders = [];

for (const f of files) {
  const md = readFileSync(join(dir, f), "utf8");
  const p = extractPrompt(md);
  if (p === null) {
    console.log("跳过（无 Prompt 块）  " + f);
    continue;
  }
  checked++;
  const bad = new Map();
  for (const ch of p) {
    if (isAllowed(ch)) continue;
    bad.set(ch, (bad.get(ch) || 0) + 1);
  }
  if (bad.size === 0) {
    console.log("合规                  " + f);
  } else {
    const desc = [...bad.entries()].map(([c, n]) => `${c}x${n}`).join(" ");
    console.log("违规  " + desc.padEnd(28) + f);
    totalBad += [...bad.values()].reduce((a, b) => a + b, 0);
    offenders.push(f);
  }
}

console.log("");
console.log(
  "共校验 " + checked + " 份，违规 " + offenders.length + " 份，违规符号累计 " + totalBad + " 处"
);
process.exit(totalBad === 0 ? 0 : 1);
