import { NextResponse } from "next/server";

const SYSTEM_PROMPT = `你是校园通知信息提取器。用户会给你一段通知原文，你必须输出一个 json 对象，不要输出任何其他内容。

json 的字段固定为：
- title: 字符串，通知标题，没有则填 null
- deadline: 字符串，截止日期，没有则填 null
- time: 字符串，具体时间（24小时制 HH:MM），没有则填 null
- location: 字符串，地点，没有则填 null
- summary: 字符串，一句话摘要，没有则填 null
- category: 字符串，分类，只能是以下之一：教务、活动、行政、后勤、其他

规则：
1. 只提取原文明确写出的信息，原文没写就填 null，绝对不要猜测或编造。
2. 相对日期（如“下周三”）如果原文没有给出可换算的基准日期，deadline 保留原文写法（如“下周三”），不要自行换算成具体年月日。
3. deadline 和 time 要分开。例如“11月15日下午5点前”，deadline 是“11月15日”，time 是“17:00”。
4. 输出必须是合法 json，不要加 markdown 代码块，不要加解释。`;

const JSON_EXAMPLE = `示例输入：
请各班班长于11月15日下午5点前将名单报送至教务处A301办公室。

示例输出：
{"title":"名单报送通知","deadline":"11月15日","time":"17:00","location":"教务处A301办公室","summary":"各班班长于11月15日17:00前报送名单","category":"行政"}`;

export async function POST(request) {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "no_key", message: "未配置 DEEPSEEK_API_KEY" },
      { status: 200 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "bad_request", message: "请求体不是合法 JSON" },
      { status: 400 }
    );
  }

  const text = String(body?.text || "").trim();
  if (!text) {
    return NextResponse.json(
      { ok: false, error: "empty_text", message: "通知原文为空" },
      { status: 400 }
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify({
        model: "deepseek-flash",
        stream: false,
        thinking: { type: "disabled" },
        max_tokens: 1024,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON_EXAMPLE + "\\n\\n现在请处理这条通知：\\n" + text },
        ],
      }),
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: "upstream_" + res.status, message: detail.slice(0, 200) },
        { status: 200 }
      );
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content || !content.trim()) {
      return NextResponse.json(
        { ok: false, error: "empty_content", message: "模型返回了空内容" },
        { status: 200 }
      );
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      // JSON 模式偶尔仍可能带空格填充，再尝试一次从首尾花括号截取
      const start = content.indexOf("{");
      const end = content.lastIndexOf("}");
      if (start !== -1 && end > start) {
        try {
          parsed = JSON.parse(content.slice(start, end + 1));
        } catch {
          return NextResponse.json(
            { ok: false, error: "invalid_json", message: content.slice(0, 200) },
            { status: 200 }
          );
        }
      } else {
        return NextResponse.json(
          { ok: false, error: "invalid_json", message: content.slice(0, 200) },
          { status: 200 }
        );
      }
    }

    // 规范化：所有字段最多保留字符串或 null，不信任模型返回的额外字段
    const normalize = (v) =>
      typeof v === "string" && v.trim() ? v.trim() : null;

    return NextResponse.json({
      ok: true,
      result: {
        title: normalize(parsed.title),
        deadline: normalize(parsed.deadline),
        time: normalize(parsed.time),
        location: normalize(parsed.location),
        summary: normalize(parsed.summary),
        category: normalize(parsed.category),
      },
    });
  } catch (err) {
    clearTimeout(timeout);
    const isAbort = err?.name === "AbortError";
    return NextResponse.json(
      {
        ok: false,
        error: isAbort ? "timeout" : "network_error",
        message: isAbort ? "请求超时" : String(err?.message || err),
      },
      { status: 200 }
    );
  }
}