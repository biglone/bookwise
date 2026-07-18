"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

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

type UploadWorkspaceProps = {
  initialBooks: Book[];
};

export function UploadWorkspace({ initialBooks }: UploadWorkspaceProps) {
  const [books, setBooks] = useState(initialBooks);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState(initialBooks[0]?.id ?? null);
  const [isPending, startTransition] = useTransition();

  const selectedBook = books.find((item) => item.id === selectedId) ?? books[0] ?? null;

  async function handleSubmit(formData: FormData) {
    setError(null);

    const response = await fetch("/api/books/upload", {
      method: "POST",
      body: formData,
    });

    const payload = (await response.json()) as { item?: Book; error?: string };

    if (!response.ok || !payload.item) {
      setError(payload.error || "上传失败。");
      return;
    }

    startTransition(() => {
      setBooks((current) => [payload.item!, ...current]);
      setSelectedId(payload.item!.id);
    });
  }

  return (
    <section className="workspace-shell">
      <div className="workspace-header">
        <div>
          <p className="section-label">书库工作台</p>
          <h2>上传、筛选并进入章节导学</h2>
        </div>
        <p className="panel-copy">
          当前书库里的每本书都会先被解析为章节树，再进入章节导学页面生成更完整的学习内容。
        </p>
      </div>

      <section className="workspace">
        <div className="upload-panel">
          <p className="section-label">上传入口</p>
          <h3>上传一本书并抽取章节结构</h3>
          <p className="panel-copy">
            当前支持 `PDF`、`EPUB`、`Markdown`、`Text`。上传完成后，后端会返回书籍记录和章节目录，作为后续分章导学生成的输入。
          </p>
          <form
            className="upload-form"
            action={async (formData) => {
              await handleSubmit(formData);
            }}
          >
            <label className="file-input">
              <span>选择图书文件</span>
              <input name="book" type="file" accept=".pdf,.epub,.md,.markdown,.txt" required />
            </label>
            <button className="primary-cta" type="submit" disabled={isPending}>
              {isPending ? "上传中..." : "上传并解析"}
            </button>
          </form>
          {error ? <p className="error-text">{error}</p> : null}
        </div>

        <div className="library-panel">
          <div className="library-list">
            <div className="library-header">
              <p className="section-label">图书列表</p>
              <h3>已上传书籍</h3>
            </div>
            {books.length === 0 ? (
              <p className="empty-state">还没有上传图书。</p>
            ) : (
              books.map((book) => (
                <button
                  key={book.id}
                  className={book.id === selectedBook?.id ? "book-item active" : "book-item"}
                  onClick={() => setSelectedId(book.id)}
                  type="button"
                >
                  <span className="book-kicker">图书 {book.id === selectedBook?.id ? "已选中" : "可切换"}</span>
                  <strong>{book.title}</strong>
                  <span>
                    {book.format.toUpperCase()} · {book.chapterCount} 章
                  </span>
                  <span>{formatDate(book.uploadedAt)}</span>
                </button>
              ))
            )}
          </div>

          <div className="chapter-panel">
            <div className="library-header">
              <p className="section-label">章节目录</p>
              <h3>{selectedBook ? selectedBook.title : "等待上传"}</h3>
            </div>
            {selectedBook ? (
              <ol className="chapter-list">
                {selectedBook.chapters.map((chapter) => (
                <li key={chapter.id} className={`chapter-row level-${chapter.level}`}>
                    <span className="chapter-order">第 {chapter.order} 节</span>
                    <div className="chapter-meta">
                      <strong>{chapter.title}</strong>
                      <span className="chapter-level">目录层级 {chapter.level}</span>
                      <Link
                        className="chapter-link"
                        href={`/books/${selectedBook.id}/chapters/${chapter.id}`}
                      >
                        进入章节导学
                      </Link>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty-state">上传一本书后，这里会显示抽取出的章节目录。</p>
            )}
          </div>
        </div>
      </section>
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
  }).format(new Date(value));
}
