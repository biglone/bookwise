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
        setError(payload.error || "Failed to check study guide job.");
        return;
      }

      const polledJob = payload.item;

      setJob(polledJob);
      setHistory((current) => mergeJobs(current, polledJob));

      if (polledJob.status === "succeeded" && polledJob.result) {
        setGuide(polledJob.result);
      }

      if (polledJob.status === "failed") {
        setError(polledJob.error || "Study guide generation failed.");
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
      setError(payload.error || "Failed to load study guide history.");
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
      setError(payload.error || "Failed to create study guide job.");
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
      return guide ? `Latest provider: ${guide.provider}` : "No study guide generated yet.";
    }

    if (job.status === "queued") {
      return `Queued with ${job.providerRequested}.`;
    }

    if (job.status === "running") {
      return `Generating with ${job.providerRequested}...`;
    }

    if (job.status === "succeeded") {
      return `Completed with ${job.result?.provider || job.providerRequested}.`;
    }

    return `Failed: ${job.error || "unknown error"}`;
  }, [guide, job]);

  const hasRunningJob = job?.status === "queued" || job?.status === "running";

  return (
    <div className="detail-card">
      <div className="detail-topbar">
        <div>
          <p className="section-label">Study Guide</p>
          <h1>{chapterTitle}</h1>
          <p className="lede">{bookTitle}</p>
        </div>
        <div className="action-row">
          <button className="secondary-cta" disabled={isPending || hasRunningJob} onClick={() => void handleGenerate(true)} type="button">
            {isPending ? "Starting..." : "Regenerate"}
          </button>
          <button className="primary-cta" disabled={isPending} onClick={() => void handleGenerate()} type="button">
            {isPending ? "Starting..." : "Generate with AI"}
          </button>
        </div>
      </div>

      <div className="study-status-bar">
        <strong>Status</strong>
        <span>{statusText}</span>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <section className="study-block">
        <div className="history-header">
          <div>
            <p className="section-label">Job History</p>
            <h2>Recent runs</h2>
          </div>
          <span className="history-meta">{history.length} items</span>
        </div>
        {history.length === 0 ? (
          <p className="panel-copy">No job history yet for this chapter.</p>
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
                <strong>{item.result?.provider || item.providerRequested}</strong>
                <span>{formatTimestamp(item.updatedAt)}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {!guide ? (
        <section className="study-block">
          <p className="panel-copy">
            No completed study guide yet. Start a generation job to create a chapter explanation.
          </p>
        </section>
      ) : (
        <>
          <div className="detail-grid">
            <section className="study-block">
              <p className="section-label">Snapshot</p>
              <h2>Chapter focus</h2>
              <p>{guide.snapshot.focus}</p>
              <h3>Why it matters</h3>
              <p>{guide.snapshot.whyItMatters}</p>
              <h3>Prerequisites</h3>
              <ul className="study-list">
                {guide.snapshot.prerequisites.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>

            <section className="study-block">
              <p className="section-label">Preview</p>
              <h2>Source preview</h2>
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
            <p className="section-label">Deep Dive</p>
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
              <p className="section-label">Terminology</p>
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
              <p className="section-label">Retention</p>
              <h3>Key takeaways</h3>
              <ul className="study-list">
                {guide.retention.keyTakeaways.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <h3>Review questions</h3>
              <ul className="study-list">
                {guide.retention.reviewQuestions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <h3>Practice ideas</h3>
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
