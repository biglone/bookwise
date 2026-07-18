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
const defaultAiProvider = process.env.AI_PROVIDER || "codex-cli";
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
const studyGuideJobsIndexPath = path.join(storageRoot, "study-guide-jobs.json");
const aiSettingsPath = path.join(storageRoot, "ai-settings.json");
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
});

const supportedAiProviders = ["codex-cli", "heuristic"] as const;

type AiProvider = (typeof supportedAiProviders)[number];

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

type StudyGuideJob = {
  id: string;
  bookId: string;
  chapterId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  providerRequested: AiProvider;
  createdAt: string;
  updatedAt: string;
  error: string | null;
  result: StudyGuide | null;
};

type AiSettingsRecord = {
  provider: AiProvider;
  updatedAt: string;
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

app.get("/api/ai/settings", async (_request, response) => {
  const item = await readAiSettings();

  response.json({
    item,
    providers: supportedAiProviders.map((provider) => ({
      id: provider,
      label: provider === "codex-cli" ? "Codex CLI" : "启发式回退",
      available: isProviderAvailable(provider),
      description:
        provider === "codex-cli"
          ? "使用服务器上配置好的本地 codex CLI。"
          : "使用内置的本地启发式回退，不依赖外部 CLI。",
    })),
  });
});

app.put("/api/ai/settings", async (request, response) => {
  const provider = request.body?.provider;

  if (!isAiProvider(provider)) {
    response.status(400).json({
      error: `不支持的 provider，请使用：${supportedAiProviders.join("、")}。`,
    });
    return;
  }

  if (!isProviderAvailable(provider)) {
    response.status(400).json({
      error: `${provider} 在当前服务器环境中不可用。`,
    });
    return;
  }

  const item: AiSettingsRecord = {
    provider,
    updatedAt: new Date().toISOString(),
  };

  await writeAiSettings(item);
  response.json({ item });
});

app.get("/api/books/:bookId", async (request, response) => {
  const items = await readBooks();
  const book = items.find((item) => item.id === request.params.bookId);

  if (!book) {
    response.status(404).json({ error: "未找到图书。" });
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
    response.status(404).json({ error: "未找到章节。" });
    return;
  }

  const jobs = await readStudyGuideJobs();
  const latestGuide = jobs
    .filter(
      (item) =>
        item.bookId === book.id &&
        item.chapterId === chapter.id &&
        item.status === "succeeded" &&
        item.result,
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];

  if (!latestGuide?.result) {
    response.status(404).json({ error: "当前章节还没有生成导学。" });
    return;
  }

  response.json({ item: latestGuide.result });
});

app.get("/api/books/:bookId/chapters/:chapterId/study-guide-jobs", async (request, response) => {
  const items = await readBooks();
  const book = items.find((item) => item.id === request.params.bookId);

  if (!book) {
    response.status(404).json({ error: "未找到图书。" });
    return;
  }

  const chapter = book.chapters.find((item) => item.id === request.params.chapterId);

  if (!chapter) {
    response.status(404).json({ error: "未找到章节。" });
    return;
  }

  const jobs = await readStudyGuideJobs();
  const chapterJobs = jobs
    .filter((item) => item.bookId === book.id && item.chapterId === chapter.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 10);

  response.json({ items: chapterJobs });
});

app.post("/api/books/:bookId/chapters/:chapterId/study-guide-jobs", async (request, response) => {
  const items = await readBooks();
  const book = items.find((item) => item.id === request.params.bookId);

  if (!book) {
    response.status(404).json({ error: "未找到图书。" });
    return;
  }

  const chapter = book.chapters.find((item) => item.id === request.params.chapterId);

  if (!chapter) {
    response.status(404).json({ error: "未找到章节。" });
    return;
  }

  const refreshRequested =
    request.query.refresh === "1" ||
    request.query.refresh === "true" ||
    request.query.force === "1" ||
    request.query.force === "true";

  const existingJobs = await readStudyGuideJobs();
  const chapterJobs = existingJobs
    .filter((item) => item.bookId === book.id && item.chapterId === chapter.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  const activeJob = chapterJobs.find((item) => item.status === "queued" || item.status === "running");

  if (activeJob && !refreshRequested) {
    response.status(200).json({
      item: activeJob,
      reused: true,
      reason: "active-job",
    });
    return;
  }

  const latestSucceededJob = chapterJobs.find((item) => item.status === "succeeded" && item.result);

  if (latestSucceededJob && !refreshRequested) {
    response.status(200).json({
      item: latestSucceededJob,
      reused: true,
      reason: "cached-result",
    });
    return;
  }

  const settings = await readAiSettings();
  const job: StudyGuideJob = {
    id: randomUUID(),
    bookId: book.id,
    chapterId: chapter.id,
    status: "queued",
    providerRequested: settings.provider,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    error: null,
    result: null,
  };

  existingJobs.unshift(job);
  await writeStudyGuideJobs(existingJobs);

  void runStudyGuideJob(job.id);

  response.status(202).json({ item: job, reused: false, reason: "queued" });
});

app.get("/api/study-guide-jobs/:jobId", async (request, response) => {
  const jobs = await readStudyGuideJobs();
  const job = jobs.find((item) => item.id === request.params.jobId);

  if (!job) {
    response.status(404).json({ error: "Study guide job not found." });
    return;
  }

  response.json({ item: job });
});

app.post(
  "/api/books/upload",
  upload.single("book"),
  async (request, response) => {
    const file = request.file;

  if (!file) {
      response.status(400).json({ error: "请先选择一个文件。" });
      return;
    }

    const format = detectFormat(file.originalname, file.mimetype);

    if (!format) {
      response.status(400).json({
        error: "不支持的格式，请使用 PDF、EPUB、Markdown 或文本文件。",
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

  try {
    await fs.access(studyGuideJobsIndexPath);
  } catch {
    await fs.writeFile(studyGuideJobsIndexPath, "[]\n");
  }

  try {
    await fs.access(aiSettingsPath);
  } catch {
    await writeAiSettings({
      provider: normalizeProvider(defaultAiProvider),
      updatedAt: new Date().toISOString(),
    });
  }

  const jobs = await readStudyGuideJobs();
  const repairedJobs = jobs.map((job) =>
    job.status === "running" || job.status === "queued"
      ? {
          ...job,
          status: "failed" as const,
          updatedAt: new Date().toISOString(),
          error: "Job interrupted before completion.",
        }
      : job,
  );
  await writeStudyGuideJobs(repairedJobs);
}

async function readBooks() {
  const raw = await fs.readFile(booksIndexPath, "utf8");
  return JSON.parse(raw) as BookRecord[];
}

async function writeBooks(items: BookRecord[]) {
  await fs.writeFile(booksIndexPath, JSON.stringify(items, null, 2));
}

async function readStudyGuideJobs() {
  const raw = await fs.readFile(studyGuideJobsIndexPath, "utf8");
  return JSON.parse(raw) as StudyGuideJob[];
}

async function writeStudyGuideJobs(items: StudyGuideJob[]) {
  await fs.writeFile(studyGuideJobsIndexPath, JSON.stringify(items, null, 2));
}

async function readAiSettings() {
  const raw = await fs.readFile(aiSettingsPath, "utf8");
  const parsed = JSON.parse(raw) as Partial<AiSettingsRecord>;

  return {
    provider: normalizeProvider(parsed.provider),
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
  } satisfies AiSettingsRecord;
}

async function writeAiSettings(item: AiSettingsRecord) {
  await fs.writeFile(aiSettingsPath, JSON.stringify(item, null, 2));
}

async function updateStudyGuideJob(
  jobId: string,
  updater: (job: StudyGuideJob) => StudyGuideJob,
) {
  const jobs = await readStudyGuideJobs();
  const nextJobs = jobs.map((job) => (job.id === jobId ? updater(job) : job));
  await writeStudyGuideJobs(nextJobs);
  return nextJobs.find((job) => job.id === jobId) ?? null;
}

async function runStudyGuideJob(jobId: string) {
  const runningJob = await updateStudyGuideJob(jobId, (job) => ({
    ...job,
    status: "running",
    updatedAt: new Date().toISOString(),
    error: null,
  }));

  if (!runningJob) {
    return;
  }

  try {
    const books = await readBooks();
    const book = books.find((item) => item.id === runningJob.bookId);

    if (!book) {
      throw new Error("Book not found for study guide job.");
    }

    const chapter = book.chapters.find((item) => item.id === runningJob.chapterId);

    if (!chapter) {
      throw new Error("Chapter not found for study guide job.");
    }

    const guide = await generateStudyGuide(book, chapter, runningJob.providerRequested);

    await updateStudyGuideJob(jobId, (job) => ({
      ...job,
      status: "succeeded",
      updatedAt: new Date().toISOString(),
      error: null,
      result: guide,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Study guide job failed.";
    await updateStudyGuideJob(jobId, (job) => ({
      ...job,
      status: "failed",
      updatedAt: new Date().toISOString(),
      error: message,
    }));
  }
}

async function generateStudyGuide(
  book: BookRecord,
  chapter: ChapterRecord,
  provider: AiProvider,
): Promise<StudyGuide> {
  if (provider === "codex-cli") {
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
  const focus = sentences.length > 0
    ? `本章主要围绕关键概念、示例和推理链展开，阅读时要先抓住作者如何铺垫问题，再看他如何给出结论。`
    : `《${chapter.title}》是《${book.title}》中的核心章节，需要围绕定义、例子和推理顺序来理解。`;
  const whyItMatters = nextChapter
    ? `这一章会为下一章《${nextChapter.title}》铺垫概念，先把这里的定义和例子吃透，后续阅读会更顺。`
    : `这一章更像是《${book.title}》后半段的收束部分，会把前面的概念整理成更完整的理解框架。`;
  const prerequisites = [
    previousChapter
      ? `先回顾上一章《${previousChapter.title}》。`
      : `先把前面的导言和基础定义过一遍，再进入深读。`,
    `留意《${chapter.title}》里反复出现的名词、代码术语和结构标签。`,
    `阅读时优先还原作者的论证顺序，而不是只记标题。`,
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
    sourcePreview: previewParagraphs.length > 0 ? buildChinesePreviewItems(chapter.title, focus) : [focus],
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
    "你正在为上传的图书章节生成结构化学习导学。",
    "所有最终输出必须使用简体中文。",
    "如果原文是英文或其他语言，可以保留少量关键技术词，但解释、标题、问题与复习内容必须是中文。",
    "只输出符合 JSON schema 的内容，不要提及 schema，不要使用 markdown 代码块。",
    "要尽量保真，避免把内容压缩成浅层摘要。",
    "",
    `图书标题：${book.title}`,
    `图书格式：${book.format}`,
    `章节标题：${chapter.title}`,
    "",
    "输出要求：",
    "- snapshot.focus：用 2-4 句中文解释这一章的核心思想",
    "- snapshot.whyItMatters：说明这一章在整本书中的位置和作用",
    "- snapshot.prerequisites：给出 3 条中文前置建议",
    "- deepDive：给出 2-4 个有清晰标题的深入小节，解释要密一点",
    "- terminology：列出 3-6 个重要术语，并用中文解释",
    "- retention.keyTakeaways：给出 3-5 条关键要点",
    "- retention.reviewQuestions：给出 4-6 个中文复习问题",
    "- retention.practiceIdeas：给出 2-4 个可执行的学习动作",
    "- sourcePreview：给出 1-3 条中文改写的原文要点预览，不要长引文",
    "",
    "章节原文摘录：",
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

function isAiProvider(value: unknown): value is AiProvider {
  return typeof value === "string" && supportedAiProviders.includes(value as AiProvider);
}

function normalizeProvider(value: unknown): AiProvider {
  return isAiProvider(value) ? value : "codex-cli";
}

function isProviderAvailable(provider: AiProvider) {
  if (provider === "heuristic") {
    return true;
  }

  return provider === "codex-cli";
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
        heading: "核心判断",
        explanation: `学习《${chapterTitle}》时，要按定义、例子和权衡顺序去读，才能抓住作者真正想表达的层次。`,
        signals: ["定义", "示例", "权衡"],
      },
    ];
  }

  return segments.map((segment, index) => ({
    heading:
      index === 0
        ? "概念铺垫"
        : index === 1
          ? "机制与示例"
          : "影响与注意点",
    explanation: buildChineseExplanation(segment),
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
    meaning: `在这一章里，"${term}" 是关键术语。你需要找出作者在哪里定义它、如何使用它，以及它和其他概念的区别。`,
  }));
}

function buildKeyTakeaways(chapterTitle: string, sentences: string[]) {
  const base = [
    `围绕《${chapterTitle}》来组织笔记，不要只背零散细节。`,
    `做笔记时尽量保留作者的推理顺序。`,
    `把会改变理解的例子、提醒和代码片段单独标出来。`,
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
    `《${chapterTitle}》想解决或澄清什么问题？`,
    `这一章里哪些定义是基础性的，而不是可有可无的？`,
    `哪个例子或机制最能说明本章的核心主张？`,
  ];

  if (terminology[0]) {
    questions.push(`如果不用书里的原话，你会怎么解释“${terminology[0].term}”？`);
  }

  if (nextChapter) {
    questions.push(`这一章是如何为《${nextChapter.title}》做铺垫的？`);
  }

  return questions.slice(0, 5);
}

function buildPracticeIdeas(chapterTitle: string, format: string) {
  return [
    `写一页笔记，按顺序重建《${chapterTitle}》的完整论证链。`,
    `把这一章里反复出现的术语整理成卡片。`,
    format === "pdf" || format === "epub"
      ? `标出作者在哪里提出概念、给出例子以及补充限制条件。`
      : `标出章节从概念切换到例子再到结论的具体位置。`,
  ];
}

function buildChinesePreviewItems(chapterTitle: string, focus: string) {
  return [
    `《${chapterTitle}》的开头通常在建立核心问题和阅读视角。`,
    "后面的内容会逐步展开机制、示例和作者的推理顺序。",
    `如果只看一遍，至少要记住这章是在为整体理解搭桥，而不是单独堆概念。`,
    focus,
  ].slice(0, 3);
}

function buildChineseExplanation(sentences: string[]) {
  const signals = extractSignals(sentences.join(" "));

  if (signals.length === 0) {
    return "这一部分主要帮助你理解作者的定义、例子与结论之间的关系。";
  }

  return `这一部分主要围绕 ${signals.slice(0, 3).map((item) => `「${item}」`).join("、")} 展开，重点是理解作者如何把概念、例子和结论串成一条推理链。`;
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
      title: "导入内容",
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
