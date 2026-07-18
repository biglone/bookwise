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
    title: "图书上传与章节化",
    body:
      "面向 PDF、EPUB 和 Markdown 资料，先解析结构、目录、图片和代码块，再进入学习生成链路。",
  },
  {
    title: "低压缩章节导学",
    body:
      "每章提供简版概览、深版解释、术语拆解、图表代码说明和复习包，而不是只做薄摘要。",
  },
  {
    title: "Agent Orchestration",
    body:
      "支持把 Codex CLI、Claude Code CLI、DeepSeek API 等接到服务端编排层，统一任务路由和缓存。",
  },
];

const architecture = [
  "frontend: Next.js 独立前端，负责上传、书库、章节页和学习界面。",
  "backend: Node.js API，负责图书元数据、章节任务、模型编排和结果持久化。",
  "deploy: Docker Compose 编排 frontend、backend、cloudflared。",
  "access: 通过 Cloudflare Tunnel 提供公网域名访问。",
];

export default async function Home() {
  const apiStatus = await getApiStatus();
  const books = await getBooks();
  const aiSettings = await getAiSettings();

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Frontend + Backend + Tunnel</p>
          <h1>Bookwise</h1>
          <p className="lede">
            一个更宽泛的图书学习平台，不局限于技术书。上传电子书后，按章节生成保真度更高的学习解读，并由独立后端负责任务编排与模型接入。
          </p>
          <div className="cta-row">
            <a href="#architecture" className="primary-cta">
              查看架构
            </a>
            <a href="#deploy" className="secondary-cta">
              查看部署
            </a>
          </div>
        </div>
        <div className="status-card">
          <span className="status-label">API Status</span>
          <strong className={apiStatus.ok ? "ok" : "bad"}>{apiStatus.message}</strong>
          <p>
            前端通过服务端内部地址访问后端健康检查接口，用于验证前后端已分离。
          </p>
        </div>
      </section>

      <section className="grid-section">
        {pillars.map((pillar) => (
          <article key={pillar.title} className="info-card">
            <h2>{pillar.title}</h2>
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

      <UploadWorkspace initialBooks={books} />

      <section id="architecture" className="split-section">
        <div>
          <p className="section-label">Architecture</p>
          <h2>前后端分离结构</h2>
        </div>
        <ol className="step-list">
          {architecture.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </section>

      <section id="deploy" className="split-section">
        <div>
          <p className="section-label">Deployment</p>
          <h2>公网访问与开机启动</h2>
        </div>
        <div className="skill-card">
          <p>
            Docker Compose 负责拉起 `frontend`、`backend`、`cloudflared`。系统启动时通过 systemd 拉起整套服务，cloudflared 使用持久 tunnel 凭据自动重连。
          </p>
          <code>deploy/docker-compose.yml</code>
        </div>
      </section>
    </main>
  );
}
