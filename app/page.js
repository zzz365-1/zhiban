"use client";

import { useState, useEffect } from "react";
import NoticeList from "./components/NoticeList";
import NoticeInput from "./components/NoticeInput";
import AnalysisPanel from "./components/AnalysisPanel";
import { extractNotice } from "./lib/extractNotice";
import { buildDeadlineDate } from "./lib/deadline";

const STORAGE_KEY = "zhiban.notices.v1";

function deriveTitle(text) {
  const lines = String(text || "").split(String.fromCharCode(10));
  for (const line of lines) {
    const t = line.split(String.fromCharCode(13)).join("").trim();
    if (t) {
      return t.length > 30 ? t.slice(0, 30) + "…" : t;
    }
  }
  return "未命名通知";
}

function makeId() {
  return (
    "n_" +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 6)
  );
}

export default function Home() {
  const [notices, setNotices] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [noticeText, setNoticeText] = useState("");
  const [analysis, setAnalysis] = useState(null);

  // 首次挂载时从 localStorage 读取
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setNotices(parsed);
      }
    } catch (e) {
      console.warn("读取本地通知失败：", e);
    }
    setHydrated(true);
  }, []);

  // 通知列表变化时写回 localStorage
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notices));
    } catch (e) {
      console.warn("保存本地通知失败：", e);
    }
  }, [notices, hydrated]);

  const selectedNotice =
    notices.find((n) => n.id === selectedId) ?? null;

  function handleSelect(id) {
    const target = notices.find((n) => n.id === id);
    if (!target) return;
    setSelectedId(id);
    setNoticeText(target.text);
    setAnalysis(target.analysis);
  }

  function handleDelete(id) {
    setNotices((prev) => prev.filter((n) => n.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setNoticeText("");
      setAnalysis(null);
    }
  }

  function handleParse() {
    if (!noticeText.trim()) {
      alert("请先粘贴或输入通知原文，再点击解析。");
      return;
    }
    setAnalysis(extractNotice(noticeText));
    setSelectedId(null); // 新解析视为草稿，可另存
  }

  function handleSave() {
    if (!analysis || selectedId) return;
    const deadlineDate = buildDeadlineDate(analysis.deadline, analysis.time);
    const notice = {
      id: makeId(),
      title: deriveTitle(noticeText),
      source: "手动导入",
      text: noticeText,
      analysis,
      deadlineDate: deadlineDate ? deadlineDate.getTime() : null,
      savedAt: Date.now(),
    };
    setNotices((prev) => [notice, ...prev]);
    setSelectedId(notice.id);
  }

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-6 py-3.5 shadow-sm">
        <h1 className="text-lg font-bold tracking-tight text-slate-900">
          知办
        </h1>
        <span className="text-sm text-slate-400">校园通知行动助手</span>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[260px_1fr_280px]">
        <NoticeList
          notices={notices}
          selectedId={selectedId}
          onSelect={handleSelect}
          onDelete={handleDelete}
          hydrated={hydrated}
        />

        <NoticeInput
          value={noticeText}
          onChange={setNoticeText}
          onParse={handleParse}
          onSave={handleSave}
          canSave={Boolean(analysis) && !selectedId}
          saveLabel={selectedId ? "已保存" : "保存到我的通知"}
        />

        <AnalysisPanel selectedNotice={selectedNotice} analysis={analysis} />
      </div>
    </div>
  );
}