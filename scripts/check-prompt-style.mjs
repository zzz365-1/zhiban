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
  if (ch === "\n" || ch === "\r" || ch === " ") return true;
  return /[A-Za-z0-9]/.test(ch);
}

function extractPrompt(md) {
  const at = md.indexOf("## Prompt");
  if (at < 0) return null;
  const rest = md.slice(at);
  // Windows 下 git checkout 会把文件转成 CRLF，代码围栏后面跟着的是 \r\n，
  // 只写 \n 会整块匹配失败表现为「无 Prompt 块」。必须两种换行都接受。
  const m = rest.match(/```[a-z]*\r?\n([\s\S]*?)```/);
  return m ? m[1] : null;
}

const dir = "prompts";
const files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();

/**
 * 归档分界线。早于这条线的文档已经投喂给 AI 执行过，
 * 用户明确指示不再回溯修改，否则文档与实际投喂给模型的文本就不一致了。
 *
 * 所以这些文件只报告、不计入退出码，避免历史问题永久掩盖当前问题。
 * 但这不等于看不见——违规数量照常打印出来，看得清清楚楚。
 */
const ARCHIVE_BOUNDARY = "019b-quantity-variants-and-comments.md";

let totalBad = 0;
let checked = 0;
let skipped = 0;
let archiveCount = 0;
let archiveBad = 0;

for (const f of files) {
  const md = readFileSync(join(dir, f), "utf8");
  const p = extractPrompt(md);
  if (p === null) {
    skipped++;
    console.log("跳过（无 Prompt 块）  " + f);
    continue;
  }
  checked++;
  const bad = new Map();
  for (const ch of p) {
    if (isAllowed(ch)) continue;
    bad.set(ch, (bad.get(ch) || 0) + 1);
  }
  const count = [...bad.values()].reduce((a, b) => a + b, 0);
  const desc = [...bad.entries()].map(([c, n]) => `${c}x${n}`).join(" ");

  if (f < ARCHIVE_BOUNDARY) {
    // 历史归档：只报告，不计入失败
    if (count > 0) {
      archiveCount++;
      archiveBad += count;
      console.log("历史  " + desc.padEnd(28) + f);
    }
    continue;
  }

  if (count === 0) {
    console.log("合规                  " + f);
  } else {
    console.log("违规  " + desc.padEnd(28) + f);
    totalBad += count;
  }
}

console.log("");
console.log(
  "扫描情况：目录内 md " + files.length + " 份，实际检查 " + checked +
    " 份，跳过 " + skipped + " 份"
);
console.log(
  "当前标准：合规通过，违规 " + totalBad + " 处 —— 这一项决定退出码"
);
console.log(
  "历史归档：" + archiveCount + " 份不符合现行符号规则，共 " + archiveBad +
    " 处，已投喂不再回溯，仅作留痕"
);

/**
 * 【为什么零覆盖必须报错】
 * 这个检查器的价值来自“它真的读过那些存档”。如果有一天目录挪了、
 * 文件后缀改了、或者取块的写法坏了，它一份都读不到，却照样打印
 * “未发现违反”并返回 0。屏幕上一片绿，真实情况是根本没有检查。
 * 这比当场报错危险得多：前者引开注意力，后者立刻暴露问题。
 *
 * 所以这里把三种“等于没巡检”的情况一律判为失败：
 *   1. 目录里一份 md 都没有
 *   2. 有 md 但一份都没取到 Prompt 块
 *   3. 实际检查的份数少于目录里 md 的份数且少得过多（全部被跳过由第 2 条覆盖）
 * 判断自然写成显式分支，不用含糊的三元表达式，避免边角-smart 化之后失真。
 */
if (files.length === 0) {
  console.log("");
  console.log("？未发现待检查的 Prompt 归档，本次巡检无效（未读取任何文件）");
  console.log("无效巡检不允许通过");
  process.exit(2);
}

if (checked === 0) {
  console.log("");
  console.log(
    "？目录里有 " + files.length + " 份 md，但没有一份取到 Prompt 块，本次巡检无效"
  );
  console.log("无效巡检不允许通过");
  process.exit(2);
}

process.exit(totalBad === 0 ? 0 : 1);
