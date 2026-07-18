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
    const baseUrl = process.env.API_INTERNAL_URL || "http://localhost:4000";
    const bookResponse = await fetch(`${baseUrl}/api/books/${bookId}`, {
      cache: "no-store",
    });

    if (!bookResponse.ok) {
      return (
        <main className="page-shell">
          <section className="detail-shell">
            <div className="detail-card">
              <p className="section-label">未找到内容</p>
              <h1>章节导学不可用</h1>
              <p className="panel-copy">
                请求的图书或章节暂时无法加载。
              </p>
              <Link className="secondary-cta" href="/">
                返回首页
              </Link>
            </div>
          </section>
        </main>
      );
    }

    const bookPayload = (await bookResponse.json()) as { item: Book };
    const chapter = bookPayload.item.chapters.find((item) => item.id === chapterId);

    if (!chapter) {
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

    return (
      <main className="page-shell">
        <section className="detail-shell">
          <StudyGuidePanel
            bookId={bookPayload.item.id}
            chapterId={chapter.id}
            bookTitle={bookPayload.item.title}
            chapterTitle={chapter.title}
            initialGuide={null}
          />
          <div className="detail-footer">
            <Link className="secondary-cta" href="/">
              返回首页
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
        <StudyGuidePanel
          bookId={book.id}
          chapterId={chapterId}
          bookTitle={book.title}
          chapterTitle={guide.chapterTitle}
          initialGuide={guide}
        />
        <div className="detail-footer">
          <Link className="secondary-cta" href="/">
            返回首页
          </Link>
        </div>
      </section>
    </main>
  );
}
