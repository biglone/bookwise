"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

type StudyGuide = {
  provider: string;
  bookId: string;
  chapterId: string;
  chapterTitle: string;
  generatedAt: string;
  snapshot: {
    focus: string;
    whyItMatters: string;
    prerequisites: string[];
  };
  deepDive: Array<{
    heading: string;
    explanation: string;
    signals: string[];
  }>;
  terminology: Array<{
    term: string;
    meaning: string;
  }>;
  retention: {
    keyTakeaways: string[];
    reviewQuestions: string[];
    practiceIdeas: string[];
  };
  sourcePreview: string[];
};

type StudyGuideJob = {
  id: string;
  bookId: string;
  chapterId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  providerRequested: string;
  createdAt: string;
  updatedAt: string;
  error: string | null;
  result: StudyGuide | null;
};

type StudyGuideJobListResponse = {
  items?: StudyGuideJob[];
  error?: string;
};

type StudyGuideJobCreateResponse = {
  item?: StudyGuideJob;
  reused?: boolean;
  reason?: "active-job" | "cached-result" | "queued";
  error?: string;
};

type StudyGuidePanelProps = {
  bookId: string;
  chapterId: string;
  bookTitle: string;
  chapterTitle: string;
  initialGuide: StudyGuide | null;
};

export function StudyGuidePanel({
  bookId,
  chapterId,
  bookTitle,
  chapterTitle,
  initialGuide,
}: StudyGuidePanelProps) {
  const [guide, setGuide] = useState<StudyGuide | null>(initialGuide);
  const [job, setJob] = useState<StudyGuideJob | null>(null);
  const [history, setHistory] = useState<StudyGuideJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    void loadHistory();
  }, [bookId, chapterId]);

  useEffect(() => {
    if (!job || (job.status !== "queued" && job.status !== "running")) {
      return;
    }

    const poll = setInterval(async () => {
      const response = await fetch(`/api/study-guide-jobs/${job.id}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as { item?: StudyGuideJob; error?: string };

      if (!response.ok || !payload.item) {
        setError(payload.error || "查询任务状态失败。");
        return;
      }

      const polledJob = payload.item;

      setJob(polledJob);
      setHistory((current) => mergeJobs(current, polledJob));

      if (polledJob.status === "succeeded" && polledJob.result) {
        setGuide(polledJob.result);
      }

      if (polledJob.status === "failed") {
        setError(polledJob.error || "章节导学生成失败。");
      }
    }, 2500);

    return () => clearInterval(poll);
  }, [job]);

  async function loadHistory() {
    const response = await fetch(`/api/books/${bookId}/chapters/${chapterId}/study-guide-jobs`, {
      cache: "no-store",
    });
    const payload = (await response.json()) as StudyGuideJobListResponse;

    if (!response.ok || !payload.items) {
      setError(payload.error || "加载任务历史失败。");
      return;
    }

    setHistory(payload.items);
  }

  async function handleGenerate(refresh = false) {
    setError(null);
    const query = refresh ? "?refresh=1" : "";

    const response = await fetch(
      `/api/books/${bookId}/chapters/${chapterId}/study-guide-jobs${query}`,
      {
        method: "POST",
      },
    );
    const payload = (await response.json()) as StudyGuideJobCreateResponse;

    if (!response.ok || !payload.item) {
      setError(payload.error || "创建章节导学任务失败。");
      return;
    }

    const createdJob = payload.item;

    startTransition(() => {
      setJob(createdJob);
      setHistory((current) => mergeJobs(current, createdJob));
    });

    if (createdJob.status === "succeeded" && createdJob.result) {
      setGuide(createdJob.result);
    }

    if (payload.reused && payload.reason === "cached-result") {
      setError(null);
    }
  }

  function handleReuseJob(targetJob: StudyGuideJob) {
    startTransition(() => {
      setJob(targetJob);
      setHistory((current) => mergeJobs(current, targetJob));
    });

    if (targetJob.status === "succeeded" && targetJob.result) {
      setGuide(targetJob.result);
      setError(null);
    }
  }

  const statusText = useMemo(() => {
    if (!job) {
      return guide ? `最近一次生成来源：${guide.provider}` : "当前章节还没有可用导学。";
    }

    if (job.status === "queued") {
      return `任务已入队，等待 ${formatProviderName(job.providerRequested)} 开始处理。`;
    }

    if (job.status === "running") {
      return `正在使用 ${formatProviderName(job.providerRequested)} 生成章节导学...`;
    }

    if (job.status === "succeeded") {
      return `已完成，输出来自 ${formatProviderName(job.result?.provider || job.providerRequested)}。`;
    }

    return `生成失败：${job.error || "未知错误"}`;
  }, [guide, job]);

  const hasRunningJob = job?.status === "queued" || job?.status === "running";

  return (
    <div className="detail-card">
      <div className="detail-topbar">
        <div>
          <p className="section-label">章节导学</p>
          <h1>{chapterTitle}</h1>
          <p className="lede">{bookTitle}</p>
        </div>
        <div className="action-row">
          <button className="secondary-cta" disabled={isPending || hasRunningJob} onClick={() => void handleGenerate(true)} type="button">
            {isPending ? "提交中..." : "重新生成"}
          </button>
          <button className="primary-cta" disabled={isPending} onClick={() => void handleGenerate()} type="button">
            {isPending ? "提交中..." : "开始生成"}
          </button>
        </div>
      </div>

      <div className="study-status-bar">
        <strong>任务状态</strong>
        <span>{statusText}</span>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <section className="study-block">
        <div className="history-header">
          <div>
            <p className="section-label">任务历史</p>
            <h2>最近生成记录</h2>
          </div>
          <span className="history-meta">{history.length} 条记录</span>
        </div>
        {history.length === 0 ? (
          <p className="panel-copy">这个章节还没有生成历史。</p>
        ) : (
          <div className="history-list">
            {history.map((item) => (
              <button
                key={item.id}
                className={`history-item ${job?.id === item.id ? "active" : ""}`}
                onClick={() => handleReuseJob(item)}
                type="button"
              >
                <span className={`history-badge status-${item.status}`}>{item.status}</span>
                <strong>{formatProviderName(item.result?.provider || item.providerRequested)}</strong>
                <span>{formatTimestamp(item.updatedAt)}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {!guide ? (
        <section className="study-block">
          <p className="panel-copy">
            当前还没有完成的章节导学。你可以直接启动一次生成任务，系统会优先复用已有缓存或历史结果。
          </p>
        </section>
      ) : (
        <>
          <div className="detail-grid">
            <section className="study-block">
              <p className="section-label">章节快照</p>
              <h2>本章重点</h2>
              <p>{guide.snapshot.focus}</p>
              <h3>为什么重要</h3>
              <p>{guide.snapshot.whyItMatters}</p>
              <h3>阅读前提</h3>
              <ul className="study-list">
                {guide.snapshot.prerequisites.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>

            <section className="study-block">
              <p className="section-label">原文预览</p>
              <h2>章节片段</h2>
              <div className="preview-stack">
                {guide.sourcePreview.map((item) => (
                  <p key={item} className="preview-card">
                    {item}
                  </p>
                ))}
              </div>
            </section>
          </div>

          <section className="study-section">
            <p className="section-label">深入解读</p>
            <div className="study-stack">
              {guide.deepDive.map((item) => (
                <article key={item.heading} className="study-block">
                  <h2>{item.heading}</h2>
                  <p>{item.explanation}</p>
                  {item.signals.length > 0 ? (
                    <div className="token-row">
                      {item.signals.map((signal) => (
                        <span key={signal} className="token-pill">
                          {signal}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>

          <section className="detail-grid">
            <section className="study-block">
              <p className="section-label">术语拆解</p>
              <div className="study-stack">
                {guide.terminology.map((item) => (
                  <article key={item.term}>
                    <h3>{item.term}</h3>
                    <p>{item.meaning}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="study-block">
              <p className="section-label">复习整理</p>
              <h3>关键要点</h3>
              <ul className="study-list">
                {guide.retention.keyTakeaways.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <h3>复习问题</h3>
              <ul className="study-list">
                {guide.retention.reviewQuestions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <h3>练习建议</h3>
              <ul className="study-list">
                {guide.retention.practiceIdeas.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          </section>
        </>
      )}
    </div>
  );
}

function mergeJobs(current: StudyGuideJob[], incoming: StudyGuideJob) {
  const next = [incoming, ...current.filter((item) => item.id !== incoming.id)];
  return next
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 10);
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatProviderName(value: string | undefined) {
  if (value === "codex-cli") {
    return "Codex CLI";
  }

  if (value === "heuristic") {
    return "启发式回退";
  }

  return value || "未知引擎";
}
