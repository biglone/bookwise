# Bookwise

Bookwise 是一个图书学习平台原型。目标不是把书压成极短摘要，而是把上传内容转换成按章节组织、保真度更高的学习材料。

## 当前结构

- `frontend/`: Next.js 前端
- `backend/`: Express API
- `deploy/`: Docker Compose、systemd、cloudflared 配置
- `docs/`: 产品和架构设计
- `agent-skills/`: 配套 AI Agent Skill

## 当前能力

- 上传 `PDF`、`EPUB`、`Markdown`、`Text`
- 后端抽取书籍记录和章节目录
- 前端展示上传结果和章节预览
- 后端可通过 `codex cli` 生成章节导学，失败时回退到启发式结果
- Docker 部署下通过 `bookwise-data` volume 持久保存上传记录

## 本地开发

```bash
npm install
npm run dev:backend
npm run dev:frontend
```

- 前端默认 `http://localhost:3000`
- 后端默认 `http://localhost:4000`

## Docker 部署

```bash
cd deploy
cp .env.example .env
docker compose up -d --build
```

推荐把 `CORS_ORIGIN` 改成你的实际公网域名，例如 `https://bookwise.biglone.tech`。
如果当前机器的 `3000/4000` 已被占用，Docker Compose 默认会映射到本机 `33000/44000`。
如果要启用 `codex cli`，需要保证部署机上的 `~/.codex` 已登录，并通过 `CODEX_HOME_DIR` 挂载进 backend 容器。

## 开机启动

当前项目目录就是 `/home/Biglone/workspace/bookwise`，可直接启用：

```bash
sudo cp deploy/bookwise.service /etc/systemd/system/bookwise.service
sudo systemctl daemon-reload
sudo systemctl enable --now bookwise.service
```

## 说明

- cloudflared 使用持久 tunnel 的 credentials 文件，不使用临时 quick tunnel
- `AI_PROVIDER=codex-cli` 时，章节导学接口会优先调用 `codex exec`
- 如果 `codex exec` 失败，后端会自动回退到本地启发式导学
