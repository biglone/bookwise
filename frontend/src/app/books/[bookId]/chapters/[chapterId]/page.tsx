import Link from "next/link";

type Chapter = {
  id: string;
  title: string;
  level: number;
  order: number;
};

type Book = {
  id: string;
  title: string;
  format: string;
  language: string;
  status: string;
  uploadedAt: string;
  chapterCount: number;
  chapters: Chapter[];
};

type StudyGuide = {
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

async function getChapterStudyGuide(bookId: string, chapterId: string) {
  const baseUrl = process.env.API_INTERNAL_URL || "http://localhost:4000";
  const [bookResponse, guideResponse] = await Promise.all([
    fetch(`${baseUrl}/api/books/${bookId}`, { cache: "no-store" }),
    fetch(`${baseUrl}/api/books/${bookId}/chapters/${chapterId}/study-guide`, {
      cache: "no-store",
    }),
  ]);

  if (!bookResponse.ok || !guideResponse.ok) {
    return null;
  }

  const bookPayload = (await bookResponse.json()) as { item: Book };
  const guidePayload = (await guideResponse.json()) as { item: StudyGuide };

  return {
    book: bookPayload.item,
    guide: guidePayload.item,
  };
}

export default async function ChapterStudyGuidePage({
  params,
}: {
  params: Promise<{ bookId: string; chapterId: string }>;
}) {
  const { bookId, chapterId } = await params;
  const payload = await getChapterStudyGuide(bookId, chapterId);

  if (!payload) {
    return (
      <main className="page-shell">
        <section className="detail-shell">
          <div className="detail-card">
            <p className="section-label">Missing</p>
            <h1>Study guide unavailable</h1>
            <p className="panel-copy">
              The requested book or chapter could not be loaded.
            </p>
            <Link className="secondary-cta" href="/">
              Back to library
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const { book, guide } = payload;

  return (
    <main className="page-shell">
      <section className="detail-shell">
        <div className="detail-card">
          <div className="detail-topbar">
            <div>
              <p className="section-label">Study Guide</p>
              <h1>{guide.chapterTitle}</h1>
              <p className="lede">
                {book.title} · generated on{" "}
                {new Date(guide.generatedAt).toLocaleString("zh-CN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            </div>
            <Link className="secondary-cta" href="/">
              Back to library
            </Link>
          </div>

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
        </div>
      </section>
    </main>
  );
}
