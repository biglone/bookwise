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
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";

dotenv.config();
const execFileAsync = promisify(execFile);

const app = express();
const port = Number(process.env.PORT || 4000);
const allowedOrigin = process.env.CORS_ORIGIN || "http://localhost:3000";
const aiProvider = process.env.AI_PROVIDER || "codex-cli";
const codexBin = process.env.CODEX_BIN || "codex";
const codexModel = process.env.CODEX_MODEL || "";
const codexTimeoutMs = Number(process.env.CODEX_TIMEOUT_MS || 180000);
const codexHome = process.env.CODEX_HOME || "";
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

app.get("/api/books/:bookId/chapters/:chapterId/study-guide", async (request, response) => {
  const items = await readBooks();
  const book = items.find((item) => item.id === request.params.bookId);

  if (!book) {
    response.status(404).json({ error: "Book not found." });
    return;
  }

  const chapter = book.chapters.find((item) => item.id === request.params.chapterId);

  if (!chapter) {
    response.status(404).json({ error: "Chapter not found." });
    return;
  }

  const guide = await generateStudyGuide(book, chapter);
  response.json({ item: guide });
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

async function generateStudyGuide(book: BookRecord, chapter: ChapterRecord): Promise<StudyGuide> {
  if (aiProvider === "codex-cli") {
    try {
      return await buildStudyGuideWithCodex(book, chapter);
    } catch (error) {
      console.error("codex-cli study guide generation failed, falling back to heuristic:", error);
    }
  }

  return buildHeuristicStudyGuide(book, chapter);
}

async function buildHeuristicStudyGuide(book: BookRecord, chapter: ChapterRecord): Promise<StudyGuide> {
  const sourceText = await loadBookText(book);
  const excerpt = extractChapterExcerpt(sourceText, book, chapter);
  const previewParagraphs = excerpt
    .split(/\n{2,}/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => item.length > 30)
    .slice(0, 3);
  const sentences = excerpt
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 24);

  const nextChapter = book.chapters.find((item) => item.order === chapter.order + 1);
  const previousChapter = book.chapters.find((item) => item.order === chapter.order - 1);
  const focus = sentences[0] || `${chapter.title} is a core section in ${book.title}.`;
  const whyItMatters = nextChapter
    ? `This chapter sets up ideas that likely flow into "${nextChapter.title}", so understanding its definitions and examples first will reduce friction later.`
    : `This chapter is part of the later-stage material in ${book.title}, so it likely consolidates earlier concepts into a more complete mental model.`;
  const prerequisites = [
    previousChapter
      ? `Review the previous chapter: ${previousChapter.title}.`
      : `Review the book's introduction and earlier definitions before deep study.`,
    `Track repeated nouns, code terms, and architecture labels in "${chapter.title}".`,
    `Read with the goal of reconstructing the argument order, not just memorizing headlines.`,
  ];

  const deepDive = buildDeepDive(chapter.title, sentences);
  const terminology = extractTerminology(chapter.title, sentences);

  return {
    provider: "heuristic",
    bookId: book.id,
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    generatedAt: new Date().toISOString(),
    snapshot: {
      focus,
      whyItMatters,
      prerequisites,
    },
    deepDive,
    terminology,
    retention: {
      keyTakeaways: buildKeyTakeaways(chapter.title, sentences),
      reviewQuestions: buildReviewQuestions(chapter.title, terminology, nextChapter),
      practiceIdeas: buildPracticeIdeas(chapter.title, book.format),
    },
    sourcePreview: previewParagraphs.length > 0 ? previewParagraphs : [focus],
  };
}

async function buildStudyGuideWithCodex(book: BookRecord, chapter: ChapterRecord): Promise<StudyGuide> {
  const sourceText = await loadBookText(book);
  const excerpt = extractChapterExcerpt(sourceText, book, chapter).slice(0, 8000);
  const schemaPath = path.join(os.tmpdir(), `bookwise-study-guide-schema-${randomUUID()}.json`);
  const outputPath = path.join(os.tmpdir(), `bookwise-study-guide-output-${randomUUID()}.json`);

  const schema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: {
      snapshot: {
        type: "object",
        properties: {
          focus: { type: "string" },
          whyItMatters: { type: "string" },
          prerequisites: { type: "array", items: { type: "string" } },
        },
        required: ["focus", "whyItMatters", "prerequisites"],
        additionalProperties: false,
      },
      deepDive: {
        type: "array",
        items: {
          type: "object",
          properties: {
            heading: { type: "string" },
            explanation: { type: "string" },
            signals: { type: "array", items: { type: "string" } },
          },
          required: ["heading", "explanation", "signals"],
          additionalProperties: false,
        },
      },
      terminology: {
        type: "array",
        items: {
          type: "object",
          properties: {
            term: { type: "string" },
            meaning: { type: "string" },
          },
          required: ["term", "meaning"],
          additionalProperties: false,
        },
      },
      retention: {
        type: "object",
        properties: {
          keyTakeaways: { type: "array", items: { type: "string" } },
          reviewQuestions: { type: "array", items: { type: "string" } },
          practiceIdeas: { type: "array", items: { type: "string" } },
        },
        required: ["keyTakeaways", "reviewQuestions", "practiceIdeas"],
        additionalProperties: false,
      },
      sourcePreview: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: ["snapshot", "deepDive", "terminology", "retention", "sourcePreview"],
    additionalProperties: false,
  };

  const prompt = [
    "You are generating a structured study guide for an uploaded book chapter.",
    "Return only content that fits the provided JSON schema.",
    "Do not mention the schema. Do not include markdown fences.",
    "Preserve fidelity. Avoid shallow summarization.",
    "",
    `Book title: ${book.title}`,
    `Book format: ${book.format}`,
    `Chapter title: ${chapter.title}`,
    "",
    "Required output behavior:",
    "- snapshot.focus: explain the central idea of the chapter in 2-4 sentences",
    "- snapshot.whyItMatters: explain where this chapter fits in the learning path",
    "- snapshot.prerequisites: 3 concise bullets",
    "- deepDive: 2-4 sections with clear headings and dense explanations",
    "- terminology: 3-6 important terms with clear meanings",
    "- retention.keyTakeaways: 3-5 bullets",
    "- retention.reviewQuestions: 4-6 questions",
    "- retention.practiceIdeas: 2-4 practical study actions",
    "- sourcePreview: 1-3 short quoted or paraphrased source snippets",
    "",
    "Chapter excerpt:",
    excerpt || chapter.title,
  ].join("\n");

  try {
    await fs.writeFile(schemaPath, JSON.stringify(schema, null, 2));

    const args = [
      "exec",
      "--dangerously-bypass-approvals-and-sandbox",
      "--skip-git-repo-check",
      "--ephemeral",
      "--output-schema",
      schemaPath,
      "-o",
      outputPath,
      "-C",
      process.cwd(),
    ];

    if (codexModel) {
      args.push("--model", codexModel);
    }

    args.push(prompt);

    const execEnv = {
      ...process.env,
      ...(codexHome ? { CODEX_HOME: codexHome } : {}),
    };

    await execFileAsync(codexBin, args, {
      cwd: process.cwd(),
      env: execEnv,
      timeout: codexTimeoutMs,
      maxBuffer: 1024 * 1024 * 8,
    });

    const raw = await fs.readFile(outputPath, "utf8");
    const parsed = JSON.parse(raw) as Omit<StudyGuide, "provider" | "bookId" | "chapterId" | "chapterTitle" | "generatedAt">;

    return {
      provider: "codex-cli",
      bookId: book.id,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      generatedAt: new Date().toISOString(),
      snapshot: parsed.snapshot,
      deepDive: parsed.deepDive,
      terminology: parsed.terminology,
      retention: parsed.retention,
      sourcePreview: parsed.sourcePreview,
    };
  } finally {
    await Promise.all([
      fs.rm(schemaPath, { force: true }),
      fs.rm(outputPath, { force: true }),
    ]);
  }
}

async function loadBookText(book: BookRecord) {
  const filePath = path.join(uploadsRoot, book.storedFileName);
  const buffer = await fs.readFile(filePath);

  switch (book.format) {
    case "markdown":
    case "text":
      return buffer.toString("utf8");
    case "pdf": {
      const parserInstance = new PDFParse({ data: buffer });
      const text = await parserInstance.getText();
      await parserInstance.destroy();
      return text.text;
    }
    case "epub": {
      const zip = new AdmZip(buffer);
      return zip
        .getEntries()
        .filter((entry) => /\.(xhtml|html|htm|ncx)$/i.test(entry.entryName))
        .map((entry) => entry.getData().toString("utf8").replace(/<[^>]+>/g, " "))
        .join("\n\n");
    }
    default:
      return "";
  }
}

function extractChapterExcerpt(sourceText: string, book: BookRecord, chapter: ChapterRecord) {
  if (!sourceText.trim()) {
    return chapter.title;
  }

  const currentIndex = sourceText.indexOf(chapter.title);
  const nextChapter = book.chapters.find((item) => item.order === chapter.order + 1);
  const nextIndex = nextChapter ? sourceText.indexOf(nextChapter.title, currentIndex + chapter.title.length) : -1;

  if (currentIndex >= 0) {
    const endIndex = nextIndex > currentIndex ? nextIndex : Math.min(sourceText.length, currentIndex + 2400);
    return sourceText.slice(currentIndex, endIndex).trim();
  }

  return sourceText.slice(0, 2400).trim();
}

function buildDeepDive(chapterTitle: string, sentences: string[]) {
  const segments = [sentences.slice(0, 2), sentences.slice(2, 4), sentences.slice(4, 6)].filter(
    (item) => item.length > 0,
  );

  if (segments.length === 0) {
    return [
      {
        heading: "Main idea",
        explanation: `${chapterTitle} should be studied by tracking its definitions, examples, and tradeoffs in order.`,
        signals: ["definition", "example", "tradeoff"],
      },
    ];
  }

  return segments.map((segment, index) => ({
    heading:
      index === 0
        ? "Concept framing"
        : index === 1
          ? "Mechanism and examples"
          : "Implications and cautions",
    explanation: segment.join(" "),
    signals: extractSignals(segment.join(" ")),
  }));
}

function extractSignals(source: string) {
  const matches: string[] = source.match(/\b[A-Za-z][A-Za-z0-9_-]{4,}\b/g) || [];
  return matches.filter((item, index) => matches.indexOf(item) === index).slice(0, 4);
}

function extractTerminology(chapterTitle: string, sentences: string[]) {
  const titleTerms = chapterTitle
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((item) => item.length > 3);
  const bodyTerms = extractSignals(sentences.join(" "));
  const terms = [...titleTerms, ...bodyTerms]
    .filter((item, index, array) => array.indexOf(item) === index)
    .slice(0, 6);

  return terms.map((term) => ({
    term,
    meaning: `In this chapter, "${term}" is important enough that you should identify where the author defines it, applies it, and contrasts it with alternatives.`,
  }));
}

function buildKeyTakeaways(chapterTitle: string, sentences: string[]) {
  const base = [
    `Map the chapter around "${chapterTitle}" instead of memorizing isolated details.`,
    `Keep the author’s reasoning order intact when taking notes.`,
    `Mark every example, caveat, or code fragment that changes interpretation.`,
  ];

  const derived = sentences.slice(0, 2).map((sentence) => sentence.replace(/\s+/g, " ").trim());
  return [...derived, ...base].slice(0, 5);
}

function buildReviewQuestions(
  chapterTitle: string,
  terminology: Array<{ term: string; meaning: string }>,
  nextChapter: ChapterRecord | undefined,
) {
  const questions = [
    `What problem is "${chapterTitle}" trying to solve or clarify?`,
    `Which definitions in this chapter are foundational rather than optional?`,
    `Which example or mechanism best demonstrates the chapter’s main claim?`,
  ];

  if (terminology[0]) {
    questions.push(`How would you explain "${terminology[0].term}" without using the book’s exact wording?`);
  }

  if (nextChapter) {
    questions.push(`How does this chapter prepare you for "${nextChapter.title}"?`);
  }

  return questions.slice(0, 5);
}

function buildPracticeIdeas(chapterTitle: string, format: string) {
  return [
    `Write a one-page note that reconstructs the full argument order of "${chapterTitle}".`,
    `Make a glossary card set for the repeated terms in this chapter.`,
    format === "pdf" || format === "epub"
      ? `Annotate where the author introduces an idea, gives an example, and adds a caveat.`
      : `Mark the exact section boundaries where the chapter shifts from concept to example to implication.`,
  ];
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
