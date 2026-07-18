import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import { PDFParse } from "pdf-parse";
import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4000);
const allowedOrigin = process.env.CORS_ORIGIN || "http://localhost:3000";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 30 * 1024 * 1024,
  },
});
const storageRoot = path.join(process.cwd(), "data");
const uploadsRoot = path.join(storageRoot, "uploads");
const booksIndexPath = path.join(storageRoot, "books.json");
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
});

type ChapterRecord = {
  id: string;
  title: string;
  level: number;
  order: number;
};

type BookRecord = {
  id: string;
  title: string;
  format: string;
  language: string;
  status: "uploaded";
  uploadedAt: string;
  originalFileName: string;
  storedFileName: string;
  chapterCount: number;
  chapters: ChapterRecord[];
};

app.use(
  cors({
    origin: allowedOrigin,
  }),
);
app.use(express.json());

await ensureStorage();

app.get("/api/health", (_request, response) => {
  response.json({
    service: "bookwise-backend",
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/books", async (_request, response) => {
  const items = await readBooks();
  response.json({ items });
});

app.get("/api/books/:bookId", async (request, response) => {
  const items = await readBooks();
  const book = items.find((item) => item.id === request.params.bookId);

  if (!book) {
    response.status(404).json({ error: "Book not found." });
    return;
  }

  response.json({ item: book });
});

app.post(
  "/api/books/upload",
  upload.single("book"),
  async (request, response) => {
    const file = request.file;

    if (!file) {
      response.status(400).json({ error: "A file is required." });
      return;
    }

    const format = detectFormat(file.originalname, file.mimetype);

    if (!format) {
      response.status(400).json({
        error: "Unsupported format. Use PDF, EPUB, Markdown, or text files.",
      });
      return;
    }

    const parsed = await parseBook(file.buffer, format, file.originalname);
    const bookId = randomUUID();
    const storedFileName = `${bookId}${path.extname(file.originalname)}`;
    const uploadedAt = new Date().toISOString();

    await fs.writeFile(path.join(uploadsRoot, storedFileName), file.buffer);

    const record: BookRecord = {
      id: bookId,
      title: parsed.title,
      format,
      language: "unknown",
      status: "uploaded",
      uploadedAt,
      originalFileName: file.originalname,
      storedFileName,
      chapterCount: parsed.chapters.length,
      chapters: parsed.chapters,
    };

    const items = await readBooks();
    items.unshift(record);
    await writeBooks(items);

    response.status(201).json({ item: record });
  },
);

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  response.status(500).json({ error: message });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`bookwise-backend listening on ${port}`);
});

async function ensureStorage() {
  await fs.mkdir(uploadsRoot, { recursive: true });

  try {
    await fs.access(booksIndexPath);
  } catch {
    await fs.writeFile(booksIndexPath, "[]\n");
  }
}

async function readBooks() {
  const raw = await fs.readFile(booksIndexPath, "utf8");
  return JSON.parse(raw) as BookRecord[];
}

async function writeBooks(items: BookRecord[]) {
  await fs.writeFile(booksIndexPath, JSON.stringify(items, null, 2));
}

function detectFormat(fileName: string, mimeType: string) {
  const extension = path.extname(fileName).toLowerCase();

  if (extension === ".pdf" || mimeType === "application/pdf") {
    return "pdf";
  }

  if (extension === ".epub" || mimeType === "application/epub+zip") {
    return "epub";
  }

  if (extension === ".md" || extension === ".markdown" || mimeType === "text/markdown") {
    return "markdown";
  }

  if (extension === ".txt" || mimeType === "text/plain") {
    return "text";
  }

  return null;
}

async function parseBook(buffer: Buffer, format: string, originalFileName: string) {
  switch (format) {
    case "pdf":
      return parsePdfBook(buffer, originalFileName);
    case "epub":
      return parseEpubBook(buffer, originalFileName);
    case "markdown":
      return parseMarkdownBook(buffer, originalFileName);
    case "text":
      return parseTextBook(buffer, originalFileName);
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

async function parsePdfBook(buffer: Buffer, originalFileName: string) {
  const parserInstance = new PDFParse({ data: buffer });
  const info = await parserInstance.getInfo();
  const text = await parserInstance.getText();
  await parserInstance.destroy();

  const title = sanitizeTitle(info.info?.Title) || baseTitle(originalFileName);
  const chapters = extractChapterHeadings(text.text);

  return {
    title,
    chapters: chapters.length > 0 ? chapters : buildFallbackChapters(text.text),
  };
}

async function parseEpubBook(buffer: Buffer, originalFileName: string) {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  const navEntry =
    entries.find((entry) => entry.entryName.endsWith(".ncx")) ||
    entries.find((entry) => /nav.*\.(xhtml|html)$/i.test(entry.entryName));
  const opfEntry = entries.find((entry) => entry.entryName.endsWith(".opf"));

  let title = baseTitle(originalFileName);

  if (opfEntry) {
    const opf = parser.parse(opfEntry.getData().toString("utf8"));
    const metadataTitle =
      opf?.package?.metadata?.["dc:title"] ||
      opf?.package?.metadata?.title;
    title = sanitizeTitle(toFlatText(metadataTitle)) || title;
  }

  const chapters = navEntry
    ? extractEpubChapters(navEntry.getData().toString("utf8"))
    : [];

  return {
    title,
    chapters: chapters.length > 0 ? chapters : fallbackSingleChapter(),
  };
}

async function parseMarkdownBook(buffer: Buffer, originalFileName: string) {
  const source = buffer.toString("utf8");
  const titleMatch = source.match(/^#\s+(.+)$/m);

  return {
    title: sanitizeTitle(titleMatch?.[1]) || baseTitle(originalFileName),
    chapters: extractMarkdownHeadings(source),
  };
}

async function parseTextBook(buffer: Buffer, originalFileName: string) {
  const source = buffer.toString("utf8");

  return {
    title: baseTitle(originalFileName),
    chapters: extractChapterHeadings(source).length > 0
      ? extractChapterHeadings(source)
      : buildFallbackChapters(source),
  };
}

function extractMarkdownHeadings(source: string) {
  const chapters = source
    .split("\n")
    .map((line) => line.match(/^(#{1,6})\s+(.+?)\s*$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match, index) => ({
      id: `chapter-${index + 1}`,
      title: match[2].trim(),
      level: match[1].length,
      order: index + 1,
    }));

  return chapters.length > 0 ? chapters : fallbackSingleChapter();
}

function extractChapterHeadings(source: string) {
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const chapters: ChapterRecord[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const looksLikeChapter =
      /^(chapter|part|appendix)\b[\s.:_-]*[a-z0-9ivx]*/i.test(line) ||
      /^\d{1,2}(\.\d{1,2}){0,2}\s+[A-Z]/.test(line) ||
      /^[A-Z][A-Za-z0-9 ,:&/()-]{8,90}$/.test(line);

    if (!looksLikeChapter) {
      continue;
    }

    const normalized = line.replace(/\s+/g, " ").trim();

    if (normalized.length < 6 || normalized.length > 100 || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    chapters.push({
      id: `chapter-${chapters.length + 1}`,
      title: normalized,
      level: /^(chapter|part|appendix)\b/i.test(normalized) ? 1 : 2,
      order: chapters.length + 1,
    });
  }

  return chapters.slice(0, 24);
}

function buildFallbackChapters(source: string) {
  const paragraphs = source
    .split(/\n{2,}/)
    .map((entry) => entry.replace(/\s+/g, " ").trim())
    .filter((entry) => entry.length > 40)
    .slice(0, 6);

  if (paragraphs.length === 0) {
    return fallbackSingleChapter();
  }

  return paragraphs.map((paragraph, index) => ({
    id: `chapter-${index + 1}`,
    title: paragraph.slice(0, 72),
    level: 1,
    order: index + 1,
  }));
}

function fallbackSingleChapter() {
  return [
    {
      id: "chapter-1",
      title: "Imported content",
      level: 1,
      order: 1,
    },
  ];
}

function extractEpubChapters(source: string) {
  const cleaned = source.replace(/<[^>]+>/g, " ");
  const titles = Array.from(
    cleaned.matchAll(/(?:chapter|part|appendix)\s+[a-z0-9ivx]+[^<\n\r]{0,80}/gi),
  )
    .map((match) => match[0].replace(/\s+/g, " ").trim())
    .slice(0, 24);

  if (titles.length > 0) {
    return titles.map((title, index) => ({
      id: `chapter-${index + 1}`,
      title,
      level: 1,
      order: index + 1,
    }));
  }

  const parsed = parser.parse(source);
  const navPoints = findNavLabels(parsed);
  if (navPoints.length > 0) {
    return navPoints.map((title, index) => ({
      id: `chapter-${index + 1}`,
      title,
      level: 1,
      order: index + 1,
    }));
  }

  return [];
}

function findNavLabels(node: unknown): string[] {
  if (!node || typeof node !== "object") {
    return [];
  }

  const objectNode = node as Record<string, unknown>;
  const result: string[] = [];

  for (const [key, value] of Object.entries(objectNode)) {
    if (key === "text" || key === "navLabel") {
      const flattened = toFlatText(value);
      if (flattened) {
        result.push(flattened);
      }
    } else if (Array.isArray(value)) {
      for (const item of value) {
        result.push(...findNavLabels(item));
      }
    } else if (typeof value === "object") {
      result.push(...findNavLabels(value));
    }
  }

  return result
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => item.length > 4)
    .filter((item, index, array) => array.indexOf(item) === index)
    .slice(0, 24);
}

function toFlatText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toFlatText(entry)).join(" ").trim();
  }

  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map((entry) => toFlatText(entry))
      .join(" ")
      .trim();
  }

  return "";
}

function baseTitle(fileName: string) {
  return fileName.replace(path.extname(fileName), "");
}

function sanitizeTitle(value: string | undefined) {
  return value?.replace(/\s+/g, " ").trim();
}
