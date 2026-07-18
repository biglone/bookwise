import Link from "next/link";
import { StudyGuidePanel } from "@/components/study-guide-panel";

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

async function getChapterPageData(bookId: string, chapterId: string) {
  const baseUrl = process.env.API_INTERNAL_URL || "http://localhost:4000";
  const [bookResponse, guideResponse] = await Promise.all([
    fetch(`${baseUrl}/api/books/${bookId}`, { cache: "no-store" }),
    fetch(`${baseUrl}/api/books/${bookId}/chapters/${chapterId}/study-guide`, {
      cache: "no-store",
    }),
  ]);

  if (!bookResponse.ok) {
    return null;
  }

  const bookPayload = (await bookResponse.json()) as { item: Book };
  const guidePayload = guideResponse.ok
    ? ((await guideResponse.json()) as { item: StudyGuide })
    : null;

  return {
    book: bookPayload.item,
    guide: guidePayload?.item ?? null,
  };
}

export default async function ChapterStudyGuidePage({
  params,
}: {
  params: Promise<{ bookId: string; chapterId: string }>;
}) {
  const { bookId, chapterId } = await params;
  const payload = await getChapterPageData(bookId, chapterId);

  if (!payload) {
    return (
      <main className="page-shell">
        <section className="detail-shell">
          <div className="detail-card">
            <p className="section-label">未找到内容</p>
            <h1>章节导学不可用</h1>
            <p className="panel-copy">请求的图书或章节暂时无法加载。</p>
            <Link className="secondary-cta" href="/">
              返回首页
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const { book, guide } = payload;
  const chapters = [...book.chapters].sort((left, right) => left.order - right.order);
  const currentChapter = chapters.find((item) => item.id === chapterId);

  if (!currentChapter) {
    return (
      <main className="page-shell">
        <section className="detail-shell">
          <div className="detail-card">
            <p className="section-label">未找到内容</p>
            <h1>章节不存在</h1>
            <Link className="secondary-cta" href="/">
              返回首页
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const currentIndex = chapters.findIndex((item) => item.id === currentChapter.id);
  const previousChapter = currentIndex > 0 ? chapters[currentIndex - 1] : null;
  const nextChapter = currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;

  return (
    <main className="page-shell">
      <section className="reader-layout">
        <aside className="chapter-sidebar">
          <div className="chapter-sidebar-top">
            <p className="section-label">阅读导航</p>
            <h2>{book.title}</h2>
            <p className="panel-copy">
              当前位于第 {currentChapter.order} 节。你可以直接在左侧切换章节，或者用底部按钮连续阅读。
            </p>
          </div>

          <div className="chapter-nav-list">
            {chapters.map((chapter) => (
              <Link
                key={chapter.id}
                className={chapter.id === currentChapter.id ? "chapter-nav-item active" : "chapter-nav-item"}
                href={`/books/${book.id}/chapters/${chapter.id}`}
              >
                <span className="chapter-nav-order">第 {chapter.order} 节</span>
                <strong>{chapter.title}</strong>
              </Link>
            ))}
          </div>

          <div className="sidebar-actions">
            <Link className="secondary-cta" href="/">
              返回首页
            </Link>
          </div>
        </aside>

        <div className="reader-main">
          <section className="detail-shell">
            <StudyGuidePanel
              bookId={book.id}
              chapterId={currentChapter.id}
              bookTitle={book.title}
              chapterTitle={guide?.chapterTitle || currentChapter.title}
              chapterOrder={currentChapter.order}
              chapterCount={chapters.length}
              initialGuide={guide}
            />
            <div className="chapter-pagination">
              {previousChapter ? (
                <Link
                  className="secondary-cta"
                  href={`/books/${book.id}/chapters/${previousChapter.id}`}
                >
                  上一节：{compactChapterTitle(previousChapter.title)}
                </Link>
              ) : (
                <span className="chapter-pagination-placeholder">已经是第一节</span>
              )}

              {nextChapter ? (
                <Link
                  className="primary-cta"
                  href={`/books/${book.id}/chapters/${nextChapter.id}`}
                >
                  下一节：{compactChapterTitle(nextChapter.title)}
                </Link>
              ) : (
                <span className="chapter-pagination-placeholder">已经是最后一节</span>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function compactChapterTitle(title: string) {
  return title.length > 18 ? `${title.slice(0, 18)}...` : title;
}
