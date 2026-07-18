"use client";

import { useState, useTransition } from "react";

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

type ProviderSettingsPanelProps = {
  initialSettings: AiSettings;
  providers: AiProvider[];
};

export function ProviderSettingsPanel({
  initialSettings,
  providers,
}: ProviderSettingsPanelProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSelect(provider: AiProvider["id"]) {
    setError(null);

    const response = await fetch("/api/ai/settings", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ provider }),
    });
    const payload = (await response.json()) as { item?: AiSettings; error?: string };

    if (!response.ok || !payload.item) {
      setError(payload.error || "切换 AI provider 失败。");
      return;
    }

    startTransition(() => {
      setSettings(payload.item!);
    });
  }

  return (
    <section className="provider-panel">
      <div className="provider-header">
        <div>
          <p className="section-label">AI 路由</p>
          <h2>服务端生成引擎</h2>
        </div>
        <span className="provider-meta">当前选择：{settings.provider}</span>
      </div>

      <div className="provider-grid">
        {providers.map((provider) => {
          const isActive = settings.provider === provider.id;

          return (
            <button
              key={provider.id}
                className={`provider-card ${isActive ? "active" : ""}`}
                disabled={isPending || !provider.available}
                onClick={() => void handleSelect(provider.id)}
                type="button"
              >
                <div className="provider-card-top">
                  <strong>{provider.label}</strong>
                  <span className={provider.available ? "ok" : "bad"}>
                  {provider.available ? "可用" : "不可用"}
                  </span>
              </div>
              <p>{provider.description}</p>
              <span className="provider-id">{formatProviderName(provider.id)}</span>
            </button>
          );
        })}
      </div>

      <p className="panel-copy">
        新创建的章节任务会使用当前 provider。历史任务仍保留它们创建时的 provider，不会被新的切换动作覆盖。
      </p>
      <p className="provider-meta">
        最近更新：{formatTimestamp(settings.updatedAt)}
      </p>
      {error ? <p className="error-text">{error}</p> : null}
    </section>
  );
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatProviderName(value: string) {
  if (value === "codex-cli") {
    return "Codex CLI";
  }

  return "启发式回退";
}
