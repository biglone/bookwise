# Architecture

## Decision

项目现在按前后端分离组织：

- `frontend/`: Next.js Web 应用
- `backend/`: Express API 服务
- `deploy/`: Docker Compose、systemd、cloudflared 配置
- `agent-skills/`: 给 AI Agent 的学习内容生成 Skill

## Why

- 前端和模型编排后端职责分离，便于后续独立扩展
- API 可以单独接入任务队列、数据库、对象存储和多模型网关
- Docker 部署更适合服务端常驻运行
- Cloudflared 更适合在无公网 IP 的机器上稳定暴露 Web 服务
