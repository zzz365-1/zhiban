/**
 * 检查逻辑 自检
 * 用法：node scripts/test-regex-lint.mjs
 *
 * 引用真实模块：../app/lib/regexLint.js
 *
 * 三块独立统计，各带一个金丝雀：
 *   - lintRegexCode：14 条（代码里的 \\d \\s \\u，跳过注释）
 *   - lintPromptText：10 条（纯文本里的 \\d \\s \\u，每处出现都计）
 *   - lintPromptChars：15 条（纯文本字符集，严格规则）
 *
 * 不读 stdin，跑完就走。
 */

import {
  lintRegexCode,
  lintPromptText,
  lintPromptChars,
} from "../app/lib/regexLint.js";

const LF = String.fromCharCode(10);

function eq(a, b) {
  return a === b;
}

// ---------- lintRegexCode ----------

const CODE_CASES = [
  { name: "行注释里的 \\\\d 不报", source: "// 不要写 \\\\d" + LF + "const x = [0-9];", expected: 0 },
  { name: "块注释里的 \\\\d 不报", source: "/** 不要写 \\\\d */" + LF + "const x = [0-9];", expected: 0 },
  { name: "多行块注释里的 \\\\d 不报", source: "/**" + LF + " * \\\\d 不许写" + LF + " * \\\\s 也不行" + LF + " */" + LF + "const x = 1;", expected: 0 },
  { name: "块注释后代码里的 \\\\d 报", source: "/* 反面例子：\\\\d */" + LF + "const re = /\\\\d+/;", expected: 1 },
  { name: "正则字面量里的 \\\\d 报", source: "const re = /\\\\d+/;", expected: 1 },
  { name: "new RegExp 字符串里的 \\\\d 报", source: 'const re = new RegExp("\\\\\\\\d+");', expected: 1 },
  { name: "注释有 \\\\d、代码也有 \\\\d 报 1 处", source: "// 不要写 \\\\d" + LF + "const re = /\\\\d+/;", expected: 1 },
  { name: "代码里的 \\\\s 报", source: "const re = /\\\\s+/;", expected: 1 },
  { name: "代码里的 \\\\u 报", source: "const re = /\\\\u4e00/;", expected: 1 },
  { name: "注释里的 \\\\s 和 \\\\u 都不报", source: "// \\\\s 和 \\\\u 都不许写" + LF + "const x = 1;", expected: 0 },
  { name: "字符串里的 // 不算注释", source: 'const url = "http://example.com";' + LF + "const re = /\\\\d+/;", expected: 1 },
  { name: "代码里没有转义不报", source: "const re = /[0-9]+/;", expected: 0 },
  { name: "空源码不报", source: "", expected: 0 },
  { name: "只有注释不报", source: "// 只有注释", expected: 0 },
];

// ---------- lintPromptText ----------

const TEXT_CASES = [
  { name: "纯文本里的 \\\\d 报", source: "请用 \\\\d 表示数字", expected: 1 },
  { name: "纯文本里的 \\\\s 报", source: "请用 \\\\s 表示空白", expected: 1 },
  { name: "纯文本里的 \\\\u 报", source: "请用 \\\\u4e00 表示汉字", expected: 1 },
  { name: "纯文本里的 // 照常检查（不跳过）", source: "// 这里不是注释" + LF + "请用 \\\\d", expected: 1 },
  { name: "纯文本里的块注释符号照常检查", source: "/** 不是注释 */" + LF + "请用 \\\\d", expected: 1 },
  { name: "多行文本第 2 行有 \\\\d，报 1 处行号 2", source: "第一行" + LF + "第二行有 \\\\d" + LF + "第三行", expected: 1, expectedLine: 2 },
  {
    // 【这条是上一轮的红】
    // 原文"这里 \\d 和那里 \\d 都是违规"，一行里有两处 \\d
    // 修复前：只报 1 处（每行每 pattern 只 push 一次）
    // 修复后：报 2 处（每处出现都 push）
    name: "一行两个 \\\\d 报 2 处",
    source: "这里 \\\\d 和那里 \\\\d 都是违规",
    expected: 2,
  },
  { name: "纯文本里没有转义不报", source: "请用 [0-9] 表示数字", expected: 0 },
  { name: "空文本不报", source: "", expected: 0 },
  { name: "多行无违规不报", source: "第一行" + LF + "第二行" + LF + "第三行", expected: 0 },
];

// ---------- lintPromptChars ----------

const CHARS_CASES = [
  { name: "全中文 + 数字 + 逗号句号不报", source: "请于11月15日前提交，谢谢。", expected: 0 },
  { name: "英文字母允许", source: "DEEPSEEK API KEY 请配置", expected: 0 },
  { name: "空格允许", source: "请于 11 月 15 日提交。", expected: 0 },
  { name: "换行允许", source: "第一行。" + LF + "第二行。", expected: 0 },
  { name: "问号允许", source: "是否参加？", expected: 0 },
  { name: "感叹号不允许", source: "请注意！", expected: 1 },
  { name: "冒号不允许", source: "材料：身份证", expected: 1 },
  { name: "顿号不允许", source: "身份证、学生证", expected: 1 },
  { name: "书名号不允许（每处独立计）", source: "《申请表》", expected: 2 },
  { name: "括号不允许（每处独立计）", source: "身份证（原件）", expected: 2 },
  { name: "中文引号不允许", source: "请用“正楷”填写", expected: 2 },
  { name: "@ 不允许", source: "@所有人", expected: 1 },
  { name: "tab 不允许", source: "第一段" + String.fromCharCode(9) + "第二段", expected: 1 },
  { name: "英文半角标点不允许（全角才可以）", source: "请提交,谢谢.", expected: 2 },
  { name: "空文本不报", source: "", expected: 0 },
  { name: "多行第 3 行有违规，报 1 处行号 3", source: "第一行。" + LF + "第二行。" + LF + "第三行！", expected: 1, expectedLine: 3 },
];

// ---------- 执行 ----------

function runCode() {
  console.log("========== lintRegexCode ==========");
  console.log("");
  let pass = 0;
  let fail = 0;
  for (let i = 0; i < CODE_CASES.length; i++) {
    const c = CODE_CASES[i];
    const actual = lintRegexCode(c.source).length;
    const ok = eq(actual, c.expected);
    if (ok) pass++; else fail++;
    console.log("[" + (i + 1) + "/" + CODE_CASES.length + "] " + (ok ? "PASS" : "FAIL") + " - " + c.name);
    console.log("    期望：" + c.expected + " 处 / 实际：" + actual + " 处");
    console.log("");
  }
  return { pass, fail };
}

function runText() {
  console.log("========== lintPromptText ==========");
  console.log("");
  let pass = 0;
  let fail = 0;
  for (let i = 0; i < TEXT_CASES.length; i++) {
    const c = TEXT_CASES[i];
    const issues = lintPromptText(c.source);
    const actual = issues.length;
    let ok = eq(actual, c.expected);
    if (ok && c.expectedLine !== undefined) {
      ok = issues.length > 0 && eq(issues[0].line, c.expectedLine);
    }
    if (ok) pass++; else fail++;
    console.log("[" + (i + 1) + "/" + TEXT_CASES.length + "] " + (ok ? "PASS" : "FAIL") + " - " + c.name);
    console.log("    期望：" + c.expected + " 处 / 实际：" + actual + " 处");
    if (c.expectedLine !== undefined) {
      console.log("    期望首处行号：" + c.expectedLine + " / 实际：" + (issues.length > 0 ? issues[0].line : "无"));
    }
    console.log("");
  }
  return { pass, fail };
}

function runChars() {
  console.log("========== lintPromptChars ==========");
  console.log("");
  let pass = 0;
  let fail = 0;
  for (let i = 0; i < CHARS_CASES.length; i++) {
    const c = CHARS_CASES[i];
    const issues = lintPromptChars(c.source);
    const actual = issues.length;
    let ok = eq(actual, c.expected);
    if (ok && c.expectedLine !== undefined) {
      ok = issues.length > 0 && eq(issues[0].line, c.expectedLine);
    }
    if (ok) pass++; else fail++;
    console.log("[" + (i + 1) + "/" + CHARS_CASES.length + "] " + (ok ? "PASS" : "FAIL") + " - " + c.name);
    console.log("    期望：" + c.expected + " 处 / 实际：" + actual + " 处");
    if (c.expectedLine !== undefined) {
      console.log("    期望首处行号：" + c.expectedLine + " / 实际：" + (issues.length > 0 ? issues[0].line : "无"));
    }
    console.log("");
  }
  return { pass, fail };
}

// ---------- 三个金丝雀 ----------

function canaryCode() {
  const source = "const re = /\\\\d+/;";
  const actual = lintRegexCode(source).length;
  const wrongExpected = 0;
  console.log("[金丝雀 A] lintRegexCode 对确定违规的源码，断言必须拒绝");
  console.log("    真实 lint 返回：" + actual + " 处 / 错误期望：" + wrongExpected);
  const wouldPass = eq(actual, wrongExpected);
  if (wouldPass) {
    console.log("    BROKEN - 真实实现返回 0 处，断言逻辑可能已坏");
    return false;
  }
  console.log("    正确拒绝");
  return true;
}

function canaryText() {
  const source = "这里 \\\\d 和那里 \\\\d 都是违规";
  const actual = lintPromptText(source).length;
  const wrongExpected = 1;
  console.log("[金丝雀 B] lintPromptText 一行两处 \\\\d 断言必须拒绝“只报 1 处”");
  console.log("    真实 lint 返回：" + actual + " 处 / 错误期望：" + wrongExpected);
  const wouldPass = eq(actual, wrongExpected);
  if (wouldPass) {
    console.log("    BROKEN - 真实实现只报 1 处（回归了！），断言逻辑已坏");
    return false;
  }
  console.log("    正确拒绝");
  return true;
}

function canaryChars() {
  const source = "请于11月15日前提交！";
  const actual = lintPromptChars(source).length;
  const wrongExpected = 0;
  console.log("[金丝雀 C] lintPromptChars 对含感叹号的文本，断言必须拒绝");
  console.log("    真实 lint 返回：" + actual + " 处 / 错误期望：" + wrongExpected);
  const wouldPass = eq(actual, wrongExpected);
  if (wouldPass) {
    console.log("    BROKEN - 真实实现返回 0 处，断言逻辑可能已坏");
    return false;
  }
  console.log("    正确拒绝");
  return true;
}

// ---------- 主流程 ----------

const r1 = runCode();
const r2 = runText();
const r3 = runChars();

console.log("========== 金丝雀 ==========");
console.log("");
const c1 = canaryCode();
console.log("");
const c2 = canaryText();
console.log("");
const c3 = canaryChars();
console.log("");

const totalPass = r1.pass + r2.pass + r3.pass;
const totalFail = r1.fail + r2.fail + r3.fail;
const totalCases = CODE_CASES.length + TEXT_CASES.length + CHARS_CASES.length;

console.log(
  "业务结果：" + totalPass + " 通过 / " + totalFail + " 失败 / 共 " + totalCases + " 条" +
    "（lintRegexCode " + r1.pass + "/" + CODE_CASES.length +
    "，lintPromptText " + r2.pass + "/" + TEXT_CASES.length +
    "，lintPromptChars " + r3.pass + "/" + CHARS_CASES.length + "）"
);

const canaryOk = c1 && c2 && c3;
console.log(
  "金丝雀结果：" +
    (canaryOk ? "按预期 FAIL（三个金丝雀都正常）" : "异常 PASS（至少一个金丝雀失灵）")
);

if (totalFail > 0 || !canaryOk) {
  process.exitCode = 1;
}