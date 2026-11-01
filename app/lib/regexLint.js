/**
 * 检查逻辑的纯函数。所有 CLI 和测试脚本共用这一份。
 *
 * 提供三个入口：
 *   lintRegexCode(source)   → 检查 JS 源码里的 \\d \\s \\u 转义（跳过注释）
 *   lintPromptText(source)  → 检查纯文本里的 \\d \\s \\u 转义（每处出现都计）
 *   lintPromptChars(source) → 检查纯文本的字符集（严格规则：只允许汉字、
 *                             英文字母、数字、空格、换行、逗号、句号、问号）
 *
 * 【为什么三个分开】
 * - 代码里的注释是“反面例子”，不该报 → lintRegexCode 先剥注释
 * - 纯文本没有注释概念，\\d 就是违规 → lintPromptText 不剥
 * - 字符集规则完全不同于转义规则 → lintPromptChars 独立实现
 * 三种场景混在一个函数里，必然出现“该报的不报，不该报的报”。
 */

const BACKSLASH = String.fromCharCode(92);
const LF = String.fromCharCode(10);

export const PATTERNS = [
  { name: "数字转义", needle: BACKSLASH + "d", suggestion: "改用 [0-9]" },
  {
    name: "空白转义",
    needle: BACKSLASH + "s",
    suggestion: "改用 [ ] 或 String.fromCharCode",
  },
  {
    name: "Unicode 转义",
    needle: BACKSLASH + "u",
    suggestion: "改用 [一-龥]",
  },
];

/**
 * 允许出现在提示词里的字符。
 *
 * 规矩：
 *   汉字、英文字母（A-Z a-z）、数字（0-9）、空格、换行、回车、
 *   中文全角逗号（，）、句号（。）、问号（？）
 * 其他一切字符（包括中文全角括号引号冒号分号感叹号顿号书名号、
 * 英文半角标点、tab、全角空格、@、#、%等）都算违规。
 *
 * 【为什么用字符码区间判断，不用 Set 存所有字符】
 * 汉字区间有 2 万多字符，Set 初始化代价大。直接比较码值更快。
 * 也避免了“不同 Unicode 规范化形式（NFC/NFD）导致看起来一样但码值不同”
 * 的隐蔽 bug——这个项目在转义问题上栽过，不再引入新的字符比较坑。
 */
function isAllowedChar(ch) {
  const code = ch.codePointAt(0);
  if (code >= 0x4e00 && code <= 0x9fa5) return true; // 汉字常用区
  if (code >= 65 && code <= 90) return true;          // A-Z
  if (code >= 97 && code <= 122) return true;         // a-z
  if (code >= 48 && code <= 57) return true;          // 0-9
  if (code === 32) return true;                        // 空格
  if (code === 10) return true;                        // 换行
  if (code === 13) return true;                        // 回车
  if (code === 0xff0c) return true;                    // 中文全角逗号 ，
  if (code === 0x3002) return true;                    // 中文全角句号 。
  if (code === 0xff1f) return true;                    // 中文全角问号 ？
  return false;
}

/**
 * 去掉源码里的注释，返回每行的“代码部分”。
 * 支持：// 行注释、/* *\\/ 块注释、引号内的 // 和 /*。
 */
function stripComments(source) {
  const lines = String(source || "").split(LF);
  const result = [];
  let inBlock = false;

  for (const line of lines) {
    let codePart = "";
    let i = 0;
    let quote = null;

    while (i < line.length) {
      if (inBlock) {
        const end = line.indexOf("*/", i);
        if (end === -1) {
          i = line.length;
        } else {
          inBlock = false;
          i = end + 2;
        }
        continue;
      }

      const ch = line[i];

      if (quote) {
        codePart += ch;
        if (ch === quote && line[i - 1] !== BACKSLASH) {
          quote = null;
        }
        i++;
        continue;
      }

      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        codePart += ch;
        i++;
        continue;
      }

      if (line.slice(i, i + 2) === "//") {
        break;
      }

      if (line.slice(i, i + 2) === "/*") {
        inBlock = true;
        i += 2;
        continue;
      }

      codePart += ch;
      i++;
    }

    result.push(codePart);
  }

  return result;
}

/**
 * 检查 JS 源码里的 \\d \\s \\u 转义。注释部分跳过。
 */
export function lintRegexCode(source) {
  const codeLines = stripComments(source);
  const issues = [];

  for (const p of PATTERNS) {
    for (let i = 0; i < codeLines.length; i++) {
      const line = codeLines[i];
      let idx = line.indexOf(p.needle);
      while (idx !== -1) {
        issues.push({
          line: i + 1,
          column: idx + 1,
          rule: p.name,
          suggestion: p.suggestion,
          snippet: line.trim().slice(0, 80),
        });
        idx = line.indexOf(p.needle, idx + p.needle.length);
      }
    }
  }

  return issues;
}

/**
 * 检查纯文本里的 \\d \\s \\u 转义。每处出现都独立计。
 *
 * 【为什么每处出现都计，不能一行只 push 一次】
 * 上一版是“每行每 pattern 只 push 一次”，一行里写两个 \\d 只报一处。
 * 用户测试用例期望“报 2 处”，实际返回 1 处，一直红着。
 * 而且真出现这种情况时用户看到的是“1 处”，容易误以为只有一处要改。
 * 改成用 indexOf 循环，把每次出现都推入数组。
 */
export function lintPromptText(source) {
  const lines = String(source || "").split(LF);
  const issues = [];

  for (const p of PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let idx = line.indexOf(p.needle);
      while (idx !== -1) {
        issues.push({
          line: i + 1,
          column: idx + 1,
          rule: p.name,
          suggestion: p.suggestion,
          snippet: line.trim().slice(0, 80),
        });
        idx = line.indexOf(p.needle, idx + p.needle.length);
      }
    }
  }

  return issues;
}

/**
 * 检查纯文本的字符集。只允许：
 *   汉字、英文字母、数字、空格、换行、回车、中文全角逗号句号问号。
 * 其他一切字符都报出，报文件名由调用方负责，这里只报行号和列号。
 *
 * 【为什么每个非允许字符单独报，不合并】
 * “这一行有 5 个违规字符”不够，用户需要知道具体是哪几个字符才能改。
 * 每个字符一行报告，用户能精确对照位置。
 */
export function lintPromptChars(source) {
  const lines = String(source || "").split(LF);
  const issues = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (!isAllowedChar(ch)) {
        const code = ch.codePointAt(0);
        issues.push({
          line: i + 1,
          column: j + 1,
          char: ch,
          codePoint: code,
          codeHex: "U+" + code.toString(16).toUpperCase().padStart(4, "0"),
          snippet: line.trim().slice(0, 60),
        });
      }
    }
  }

  return issues;
}