"use client";

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
      setError(payload.error || "Upload failed.");
      return;
    }

    startTransition(() => {
      setBooks((current) => [payload.item!, ...current]);
      setSelectedId(payload.item!.id);
    });
  }

  return (
    <section className="workspace">
      <div className="upload-panel">
        <p className="section-label">Upload</p>
        <h2>上传一本书并抽取章节</h2>
        <p className="panel-copy">
          当前支持 `PDF`、`EPUB`、`Markdown`、`Text`。上传后后端会返回书籍记录和可用章节目录，作为后续分章导学生成的输入。
        </p>
        <form
          className="upload-form"
          action={async (formData) => {
            await handleSubmit(formData);
          }}
        >
          <label className="file-input">
            <span>Choose book file</span>
            <input name="book" type="file" accept=".pdf,.epub,.md,.markdown,.txt" required />
          </label>
          <button className="primary-cta" type="submit" disabled={isPending}>
            {isPending ? "Uploading..." : "Upload and parse"}
          </button>
        </form>
        {error ? <p className="error-text">{error}</p> : null}
      </div>

      <div className="library-panel">
        <div className="library-list">
          <div className="library-header">
            <p className="section-label">Library</p>
            <h2>Books</h2>
          </div>
          {books.length === 0 ? (
            <p className="empty-state">No books uploaded yet.</p>
          ) : (
            books.map((book) => (
              <button
                key={book.id}
                className={book.id === selectedBook?.id ? "book-item active" : "book-item"}
                onClick={() => setSelectedId(book.id)}
                type="button"
              >
                <strong>{book.title}</strong>
                <span>
                  {book.format.toUpperCase()} · {book.chapterCount} chapters
                </span>
              </button>
            ))
          )}
        </div>

        <div className="chapter-panel">
          <div className="library-header">
            <p className="section-label">Chapters</p>
            <h2>{selectedBook ? selectedBook.title : "Waiting for upload"}</h2>
          </div>
          {selectedBook ? (
            <ol className="chapter-list">
              {selectedBook.chapters.map((chapter) => (
                <li key={chapter.id} className={`chapter-row level-${chapter.level}`}>
                  <span className="chapter-order">{chapter.order}</span>
                  <span>{chapter.title}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-state">Upload a book to preview extracted chapters.</p>
          )}
        </div>
      </div>
    </section>
  );
}
