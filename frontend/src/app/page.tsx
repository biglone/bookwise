import { UploadWorkspace } from "@/components/upload-workspace";
import { ProviderSettingsPanel } from "@/components/provider-settings-panel";

type Book = {
  id: string;
  title: string;
  format: string;
  language: string;
  status: string;
  uploadedAt: string;
  chapterCount: number;
  chapters: Array<{
    id: string;
    title: string;
    level: number;
    order: number;
  }>;
};

type AiProvider = {
  id: "codex-cli" | "heuristic";
  label: string;
  available: boolean;
  description: string;
};

type AiSettings = {
  provider: AiProvider["id"];
  updatedAt: string;
};

async function getApiStatus() {
  const baseUrl = process.env.API_INTERNAL_URL || "http://localhost:4000";

  try {
    const response = await fetch(`${baseUrl}/api/health`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return { ok: false, message: `HTTP ${response.status}` };
    }

    const data = (await response.json()) as { service: string; status: string };
    return { ok: true, message: `${data.service}: ${data.status}` };
  } catch {
    return { ok: false, message: "backend unavailable" };
  }
}

async function getBooks() {
  const baseUrl = process.env.API_INTERNAL_URL || "http://localhost:4000";

  try {
    const response = await fetch(`${baseUrl}/api/books`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return [] as Book[];
    }

    const data = (await response.json()) as { items: Book[] };
    return data.items;
  } catch {
    return [] as Book[];
  }
}

async function getAiSettings() {
  const baseUrl = process.env.API_INTERNAL_URL || "http://localhost:4000";

  try {
    const response = await fetch(`${baseUrl}/api/ai/settings`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { item: AiSettings; providers: AiProvider[] };
    return data;
  } catch {
    return null;
  }
}

const pillars = [
  {
    title: "结构化摄取",
    body:
      "面向 PDF、EPUB、Markdown 与纯文本资料，先恢复目录与章节结构，再把内容送入学习生成链路。",
  },
  {
    title: "低压缩导学",
    body:
      "每章保留核心论证、术语、示例与练习建议，目标是降低阅读摩擦，而不是把书压扁成一句话。",
  },
  {
    title: "任务编排",
    body:
      "生成任务由后端统一调度，支持 provider 切换、历史复用、失败回退与后续多模型接入。",
  },
];

const workflow = [
  "上传图书并抽取目录结构。",
  "按章节创建学习导学任务。",
  "服务端路由到当前 AI provider。",
  "输出统一为中文的章节学习内容。",
];

export default async function Home() {
  const apiStatus = await getApiStatus();
  const books = await getBooks();
  const aiSettings = await getAiSettings();
  const chapterCount = books.reduce((total, book) => total + book.chapterCount, 0);
  const providerLabel =
    aiSettings?.providers.find((item) => item.id === aiSettings.item.provider)?.label ||
    aiSettings?.item.provider ||
    "未连接";

  return (
    <main className="page-shell">
      <section className="hero-shell">
        <div className="hero-intro">
          <p className="eyebrow">Bookwise / 阅读工作台</p>
          <h1>把一本书拆成真正可学习的章节工作流。</h1>
          <p className="lede">
            上传电子书后，平台先恢复章节结构，再生成统一中文输出的分章导学。重点不是“快摘要”，而是帮助你在更短时间内吃透原书的关键内容、术语与推理顺序。
          </p>
          <div className="hero-actions">
            <a href="#workspace" className="primary-cta">
              进入书库工作台
            </a>
            <a href="#workflow" className="secondary-cta">
              查看处理流程
            </a>
          </div>
          <div className="metric-row">
            <article className="metric-card">
              <span>书籍数</span>
              <strong>{books.length}</strong>
            </article>
            <article className="metric-card">
              <span>章节数</span>
              <strong>{chapterCount}</strong>
            </article>
            <article className="metric-card">
              <span>当前引擎</span>
              <strong>{providerLabel}</strong>
            </article>
          </div>
        </div>
        <div className="hero-aside">
          <article className="hero-status-card">
            <p className="section-label">服务状态</p>
            <strong className={apiStatus.ok ? "ok" : "bad"}>{apiStatus.message}</strong>
            <p className="panel-copy">
              前端通过内部地址读取后端健康检查接口，确认前后端分离、容器网络和公网入口都处于可用状态。
            </p>
          </article>
          <article className="hero-note-card">
            <p className="section-label">输出规则</p>
            <h2>统一中文导学</h2>
            <p className="panel-copy">
              即使原始图书是英文或其它语言，当前章节导学、解释、复习问题与术语说明也会统一输出为中文，必要时保留原始技术词。
            </p>
          </article>
        </div>
      </section>

      <section className="feature-ribbon">
        {pillars.map((pillar) => (
          <article key={pillar.title} className="ribbon-card">
            <p className="section-label">{pillar.title}</p>
            <p>{pillar.body}</p>
          </article>
        ))}
      </section>

      {aiSettings ? (
        <ProviderSettingsPanel
          initialSettings={aiSettings.item}
          providers={aiSettings.providers}
        />
      ) : null}

      <section id="workflow" className="editorial-section">
        <div className="editorial-copy">
          <p className="section-label">处理流程</p>
          <h2>不是摘要页，而是一条完整的学习生成链。</h2>
          <p className="panel-copy">
            当前版本已经把上传、解析、章节任务、任务历史、缓存复用和 provider 切换串起来，适合先作为一套可运行的学习工作台来验证。
          </p>
        </div>
        <ol className="workflow-list">
          {workflow.map((item, index) => (
            <li key={item} className="workflow-item">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <p>{item}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="workspace">
      <UploadWorkspace initialBooks={books} />
      </section>

      <section className="split-section">
        <div className="split-copy">
          <p className="section-label">系统结构</p>
          <h2>前端、后端与隧道各自独立，但围绕同一条导学任务链协作。</h2>
        </div>
        <div className="note-stack">
          <article className="note-card">
            <strong>前端</strong>
            <p>Next.js 页面负责上传体验、书库浏览、章节导学阅读与任务交互。</p>
          </article>
          <article className="note-card">
            <strong>后端</strong>
            <p>Express API 负责元数据、任务队列、AI 引擎路由与结果持久化。</p>
          </article>
          <article className="note-card">
            <strong>部署</strong>
            <p>Docker Compose 常驻运行，Cloudflare Tunnel 负责将前端服务稳定暴露到公网域名。</p>
          </article>
        </div>
      </section>

      <section className="split-section">
        <div className="split-copy">
          <p className="section-label">部署方式</p>
          <h2>当前站点已经以 Docker 方式运行，并通过 cloudflared 提供公网访问。</h2>
        </div>
        <div className="deploy-card">
          <p>
            部署目录使用 `deploy/docker-compose.yml` 编排 `frontend`、`backend`、`cloudflared`。服务重启后可由 systemd 拉起整套站点，并保持 tunnel 自动重连。
          </p>
          <code>deploy/docker-compose.yml</code>
        </div>
      </section>
    </main>
  );
}
