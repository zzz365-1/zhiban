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

今天的日期是 ${todayStr}。所有相对日期（如“明天”“本周五”“下周三”“本月底”“大后天”）都必须以今天为基准换算成具体日期，格式为“YYYY年M月D日”。

换算约定：
- “明天”= 今天 + 1 天，“后天”= 今天 + 2 天，“大后天”= 今天 + 3 天。
- “本周X”“这周X”指本周内对应的星期几。如果该日期已经过去（早于今天），顺延到下一个对应的星期几，不要返回过去的日期。
- “下周X”指下一个完整周的对应星期几。
- “本月X日”指本月的第 X 天。如果该日期已经过去，deadline 填 null，不要猜测是否顺延。
- “本月底”指本月最后一天。

如果某个相对日期你无法确定换算结果（原文表述有歧义、有多个基准、或换算后与原文其他信息冲突），deadline 填 null，绝对不要猜测或编造。

json 的字段固定为：
- title: 字符串，通知标题，没有则填 null
- deadline: 字符串，具体日期，格式“YYYY年M月D日”，没有则填 null
- time: 字符串，具体时间（24小时制 HH:MM），没有则填 null
- location: 字符串，地点，没有则填 null
- summary: 字符串，一句话摘要，没有则填 null
- category: 字符串，分类，只能是以下之一：教务、活动、行政、后勤、其他

规则：
1. 只提取原文明确写出的信息，原文没写就填 null，绝对不要猜测或编造。
2. deadline 和 time 要分开。例如“11月15日下午5点前”，deadline 是“2026年11月15日”，time 是“17:00”。
3. 如果原文的日期已经是具体日期（如“2026年11月15日”），保留原样，不要改写。
4. deadline 的选择按以下顺序判断：
   a. 先找原文里有没有“截止类动作”：截止、报送、提交、上交、递交、报名、缴费、登记、领取、发送、邮寄、上传、发至、交至、送至。有的话，deadline 选这些动作对应的日期。
   b. 如果原文同时有“活动开始日期”和“截止日期”（例如“定于某日开会，请于另一日前报名”），deadline 选截止日期，不选活动日期。
   c. 如果通篇没有任何截止类动作，只有“定于某日某时在某地举行/召开/进行/举办”这类活动安排（例如开会、讲座、演练、体检、图像采集、答辩、比赛、开幕式），把这场活动本身的日期作为 deadline。对收到通知的人来说，到场时间就是要赶的时间点。
   d. 如果既没有截止动作，也找不到活动日期，deadline 填 null。
5. 输出必须是合法 json，不要加 markdown 代码块，不要加解释。`;
}

export const FEW_SHOT_EXAMPLE = `示例输入：
请各班班长于11月15日下午5点前将名单报送至教务处A301办公室。

示例输出：
{"title":"名单报送通知","deadline":"2026年11月15日","time":"17:00","location":"教务处A301办公室","summary":"各班班长于11月15日17:00前报送名单","category":"行政"}`;

export function buildUserMessage(text) {
  return FEW_SHOT_EXAMPLE + "\\n\\n现在请处理这条通知：\\n" + text;
}

export function buildMessages(text, today = new Date()) {
  return [
    { role: "system", content: buildSystemPrompt(today) },
    { role: "user", content: buildUserMessage(text) },
  ];
}