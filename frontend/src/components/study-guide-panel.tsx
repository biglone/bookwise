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
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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

      setJob(payload.item);

      if (payload.item.status === "succeeded" && payload.item.result) {
        setGuide(payload.item.result);
      }

      if (payload.item.status === "failed") {
        setError(payload.item.error || "Study guide generation failed.");
      }
    }, 2500);

    return () => clearInterval(poll);
  }, [job]);

  async function handleGenerate() {
    setError(null);

    const response = await fetch(
      `/api/books/${bookId}/chapters/${chapterId}/study-guide-jobs`,
      {
        method: "POST",
      },
    );
    const payload = (await response.json()) as { item?: StudyGuideJob; error?: string };

    if (!response.ok || !payload.item) {
      setError(payload.error || "Failed to create study guide job.");
      return;
    }

    startTransition(() => {
      setJob(payload.item!);
    });
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

  return (
    <div className="detail-card">
      <div className="detail-topbar">
        <div>
          <p className="section-label">Study Guide</p>
          <h1>{chapterTitle}</h1>
          <p className="lede">{bookTitle}</p>
        </div>
        <button className="primary-cta" disabled={isPending} onClick={handleGenerate} type="button">
          {isPending ? "Starting..." : "Generate with AI"}
        </button>
      </div>

      <div className="study-status-bar">
        <strong>Status</strong>
        <span>{statusText}</span>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

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
