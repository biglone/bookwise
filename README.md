# Bookwise

Bookwise 是一个图书学习平台原型。目标不是把书压成极短摘要，而是把上传内容转换成按章节组织、保真度更高的学习材料。

## 当前结构

- `frontend/`: Next.js 前端
- `backend/`: Express API
- `deploy/`: Docker Compose、systemd、cloudflared 配置
- `docs/`: 产品和架构设计
- `agent-skills/`: 配套 AI Agent Skill

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

## 开机启动

当前项目目录就是 `/home/Biglone/workspace/bookwise`，可直接启用：

```bash
sudo cp deploy/bookwise.service /etc/systemd/system/bookwise.service
sudo systemctl daemon-reload
sudo systemctl enable --now bookwise.service
```

## 说明

- cloudflared 使用持久 tunnel 的 credentials 文件，不使用临时 quick tunnel
- 当前是前后端分离骨架，后续可以继续接入上传、解析、队列、数据库和模型编排
