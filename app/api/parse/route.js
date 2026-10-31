import { NextResponse } from "next/server";
import { buildMessages } from "../../lib/parsePrompt";

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
        messages: buildMessages(text),
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