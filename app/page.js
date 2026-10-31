"use client";

import { useState, useEffect } from "react";
import TopBar from "./components/TopBar";
import NoticeList from "./components/NoticeList";
import NoticeInput from "./components/NoticeInput";
import AnalysisPanel from "./components/AnalysisPanel";
import TodoList from "./components/TodoList";
import CalendarView from "./components/CalendarView";
import ShareDialog from "./components/ShareDialog";
import BatchDialog from "./components/BatchDialog";
import { buildDeadlineDate } from "./lib/deadline.js";
import { getTodoItems } from "./lib/todo.js";
import { updateNoticeAnalysis } from "./lib/noticeOps.js";
import { parseOne } from "./lib/parseOne.js";
import { isDuplicate } from "./lib/splitNotices.js";

const STORAGE_KEY = "zhiban.notices.v1";

function deriveTitle(text) {
  const lines = String(text || "").split(String.fromCharCode(10));
  for (const line of lines) {
    const t = line.split(String.fromCharCode(13)).join("").trim();
    if (t) return t.length > 30 ? t.slice(0, 30) + "…" : t;
  }
  return "未命名通知";
}

function makeId(seed) {
  return (
    "n_" +
    Date.now().toString(36) +
    "_" +
    (seed !== undefined ? seed : "") +
    "_" +
    Math.random().toString(36).slice(2, 6)
  );
}

function filterNotices(notices, query, category) {
  let result = notices;
  const q = query.trim();
  if (q) {
    result = result.filter(
      (n) =>
        (n.title && n.title.includes(q)) || (n.text && n.text.includes(q))
    );
  }
  if (category && category !== "全部") {
    result = result.filter(
      (n) => n.analysis && n.analysis.category === category
    );
  }
  return result;
}

function sourceLabel(source) {
  if (source === "manual") return "手动修正";
  if (source === "mixed") return "AI 辅助";
  if (source === "rule_fallback") return "本地识别";
  return "手动导入";
}

export default function Home() {
  const [notices, setNotices] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [noticeText, setNoticeText] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("全部");
  const [showShare, setShowShare] = useState(false);
  const [showBatch, setShowBatch] = useState(false);

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

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notices));
    } catch (e) {
      console.warn("保存本地通知失败：", e);
    }
  }, [notices, hydrated]);

  const now = Date.now();
  const filtered = filterNotices(notices, searchQuery, categoryFilter);
  const todoItems = getTodoItems(filtered, now);

  const selectedNotice = notices.find((n) => n.id === selectedId) ?? null;
  const displayAnalysis = selectedId
    ? selectedNotice?.analysis ?? null
    : analysis;

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

  async function handleParse() {
    const text = noticeText.trim();
    if (!text) {
      alert("请先粘贴或输入通知原文，再点击解析。");
      return;
    }
    setParsing(true);
    setSelectedId(null);
    const result = await parseOne(text);
    setAnalysis(result.analysis);
    setParsing(false);
  }

  function handleSave() {
    if (!analysis || selectedId) return;
    const deadlineDate = buildDeadlineDate(analysis.deadline, analysis.time);
    const notice = {
      id: makeId(),
      title: analysis.title || deriveTitle(noticeText),
      source: sourceLabel(analysis._source),
      text: noticeText,
      analysis,
      deadlineDate: deadlineDate ? deadlineDate.getTime() : null,
      savedAt: Date.now(),
    };
    setNotices((prev) => [notice, ...prev]);
    setSelectedId(notice.id);
  }

  function handleUpdateAnalysis(patch) {
    if (selectedId) {
      setNotices((prev) =>
        prev.map((n) =>
          n.id === selectedId ? updateNoticeAnalysis(n, patch) : n
        )
      );
    } else {
      setAnalysis((prev) =>
        prev ? { ...prev, ...patch, _source: "manual" } : prev
      );
    }
  }

  function handleBatchSave(items) {
    if (!items.length) {
      setShowBatch(false);
      return;
    }

    const newNotices = [];
    const seen = notices.slice();
    let seed = 0;

    for (const item of items) {
      if (isDuplicate(item.text, seen)) continue;
      const deadlineDate = buildDeadlineDate(
        item.analysis.deadline,
        item.analysis.time
      );
      const notice = {
        id: makeId(seed++),
        title: item.analysis.title || deriveTitle(item.text),
        source: sourceLabel(item.analysis._source),
        text: item.text,
        analysis: item.analysis,
        deadlineDate: deadlineDate ? deadlineDate.getTime() : null,
        savedAt: Date.now(),
      };
      newNotices.push(notice);
      seen.push(notice);
    }

    if (newNotices.length > 0) {
      setNotices((prev) => [...newNotices, ...prev]);
    }
    setShowBatch(false);
  }

  const leftWidth = activeTab === "calendar" ? "360px" : "260px";

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      <TopBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        category={categoryFilter}
        onCategoryChange={setCategoryFilter}
        parsing={parsing}
        onOpenShare={() => setShowShare(true)}
        onOpenBatch={() => setShowBatch(true)}
      />

      <div
        className="grid min-h-0 flex-1"
        style={{ gridTemplateColumns: leftWidth + " 1fr 280px" }}
      >
        <div className="min-h-0 overflow-hidden">
          {activeTab === "todo" && <TodoList items={todoItems} now={now} />}
          {activeTab === "calendar" && (
            <CalendarView notices={filtered} now={now} />
          )}
          {activeTab === "all" && (
            <NoticeList
              notices={filtered}
              selectedId={selectedId}
              onSelect={handleSelect}
              onDelete={handleDelete}
              hydrated={hydrated}
            />
          )}
        </div>

        <NoticeInput
          value={noticeText}
          onChange={setNoticeText}
          onParse={handleParse}
          onSave={handleSave}
          canSave={Boolean(analysis) && !selectedId && !parsing}
          saveLabel={
            selectedId ? "已保存" : parsing ? "解析中…" : "保存到我的通知"
          }
        />

        <AnalysisPanel
          selectedNotice={selectedNotice}
          analysis={displayAnalysis}
          draftText={noticeText}
          onUpdate={handleUpdateAnalysis}
        />
      </div>

      {showShare && (
        <ShareDialog
          notices={notices}
          now={now}
          onClose={() => setShowShare(false)}
        />
      )}

      {showBatch && (
        <BatchDialog
          existingNotices={notices}
          onSave={handleBatchSave}
          onClose={() => setShowBatch(false)}
        />
      )}
    </div>
  );
}