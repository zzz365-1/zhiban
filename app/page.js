"use client";

import { useState } from "react";
import NoticeList from "./components/NoticeList";
import NoticeInput from "./components/NoticeInput";
import AnalysisPanel from "./components/AnalysisPanel";
import { extractNotice } from "./lib/extractNotice";

const NOTICES = [
  {
    id: "n1",
    title: "关于开展2026年秋季学期教材征订工作的通知",
    source: "教务处",
  },
  {
    id: "n2",
    title: "本学期体测补测安排",
    source: "体育部",
  },
  {
    id: "n3",
    title: "关于2026年国庆节放假及调课安排的通知",
    source: "学校办公室",
  },
  {
    id: "n4",
    title: "图书馆国庆期间开放时间调整",
    source: "图书馆",
  },
  {
    id: "n5",
    title: "2026年下半年全国大学英语四六级考试报名通知",
    source: "教务处",
  },
];

export default function Home() {
  const [selectedId, setSelectedId] = useState(null);
  const [noticeText, setNoticeText] = useState("");
  const [analysis, setAnalysis] = useState(null);

  const selectedNotice = NOTICES.find((n) => n.id === selectedId) ?? null;

  function handleParse() {
    if (!noticeText.trim()) {
      alert("请先粘贴或输入通知原文，再点击解析。");
      return;
    }
    setAnalysis(extractNotice(noticeText));
  }

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-6 py-3.5 shadow-sm">
        <h1 className="text-lg font-bold tracking-tight text-slate-900">
          知办
        </h1>
        <span className="text-sm text-slate-400">
          校园通知行动助手
        </span>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[240px_1fr_280px]">
        <NoticeList
          notices={NOTICES}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <NoticeInput
          value={noticeText}
          onChange={setNoticeText}
          onParse={handleParse}
        />
        <AnalysisPanel selectedNotice={selectedNotice} analysis={analysis} />
      </div>
    </div>
  );
}