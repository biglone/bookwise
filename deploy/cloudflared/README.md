# Cloudflared Setup

使用持久 tunnel，而不是 quick tunnel。

## 需要准备

- 一个已接入 Cloudflare 的域名
- Cloudflare Zero Trust 中创建好的 tunnel
- 对应的 `TUNNEL_TOKEN`

## 行为

- `docker compose` 中的 `cloudflared` 服务使用 `restart: unless-stopped`
- `bookwise.service` 负责开机时自动拉起整套 stack
- 这样 frontend、backend、cloudflared 都会随系统启动而启动

## 推荐路由

- 公网域名 `books.example.com` -> `frontend:3000`
- 如果要单独暴露 API，可在 Cloudflare tunnel 配置中加第二条 hostname 指向 `backend:4000`
