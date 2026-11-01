/**
 * 通知解析的提示词。API route 和测试脚本共用这一份。
 */

export function getTodayString(date = new Date()) {
  return (
    date.getFullYear() +
    "年" +
    (date.getMonth() + 1) +
    "月" +
    date.getDate() +
    "日"
  );
}

export function buildSystemPrompt(today = new Date()) {
  const todayStr = getTodayString(today);
  return `你是校园通知信息提取器。用户会给你一段通知原文，你必须输出一个 json 对象，不要输出任何其他内容。

今天的日期是 ${todayStr}。

关于 deadline 的规则（重要）：
- deadline 只负责“从原文里选出哪个日期是用户要赶的那个”，不负责把相对说法换算成具体日期。换算由程序用本地规则完成。
- 如果选中的日期在原文里是具体日期（如“2026年11月15日”“11月15日”），原样返回，不要改写格式。
- 如果选中的日期在原文里是相对说法（如“明天”“本周五”“下周三”“本月底”“大后天”），原样返回这个说法，不要自己换算成具体日期。
- 如果原文有多个日期，deadline 选“需要赶的那个”（截止/报送/提交/报名/缴费/登记/领取/发送/上传/发至/交至/送至 等动作前的日期），不是活动开始日期。
- 如果通篇没有截止类动作，只有“定于某日某时在某地举行/召开/进行/举办”这类活动安排，把活动本身的日期作为 deadline。
- 如果既没有截止动作，也找不到活动日期，deadline 填 null。

json 的字段固定为：
- title: 字符串，通知标题，没有则填 null
- deadline: 字符串，按上面规则返回，没有则填 null
- time: 字符串，具体时间（24小时制 HH:MM），没有则填 null
- location: 字符串，地点，没有则填 null
- materials: 字符串数组，需要提交或携带的材料清单，没有则填 null
- audience: 字符串，面向对象，没有则填 null
- summary: 字符串，一句话摘要，没有则填 null
- category: 字符串，分类，只能是以下之一：教务、活动、行政、后勤、其他

规则：
1. 只提取原文明确写出的信息，原文没写就填 null，绝对不要猜测或编造。
2. deadline 和 time 要分开。例如“11月15日下午5点前”，deadline 是“11月15日”，time 是“17:00”。
3. materials 要完整列出原文写到的每一件材料。括号里的补充说明不要放进 materials，只要材料名本身。
4. audience 写成原文里的说法。如果原文有“@所有人”这类，audience 填“所有人”。
5. 输出必须是合法 json，不要加 markdown 代码块，不要加解释。`;
}

export const FEW_SHOT_EXAMPLE = `示例输入：
请各班班长于11月15日下午5点前将名单报送至教务处A301办公室。

示例输出：
{"title":"名单报送通知","deadline":"11月15日","time":"17:00","location":"教务处A301办公室","materials":["名单"],"audience":"各班班长","summary":"各班班长于11月15日17:00前报送名单","category":"行政"}`;

export function buildUserMessage(text) {
  return FEW_SHOT_EXAMPLE + "\\\\n\\\\n现在请处理这条通知：\\\\n" + text;
}

export function buildMessages(text, today = new Date()) {
  return [
    { role: "system", content: buildSystemPrompt(today) },
    { role: "user", content: buildUserMessage(text) },
  ];
}