# Sub-Store with Cloudflare R2 Storage

## 架构

- 前端 + 后端: Render (免费套餐)
- 数据存储: Cloudflare R2 (免费 10GB)

## 环境变量

需要在 Render Dashboard 手动设置：

- `SUB_STORE_FRONTEND_BACKEND_PATH`: /X7z8y2k3k288998488
- `R2_SECRET_ACCESS_KEY`: 277ebfe17cd273b4f3da3455807b7ee52b21bef29063ace908a2528778b82123

## 部署步骤

1. 创建 GitHub 仓库并推送代码
2. 在 Render 创建 Web Service
3. 连接 GitHub 仓库
4. 手动设置敏感环境变量
5. 部署

## 数据持久化

所有数据存储在 Cloudflare R2，两个 Render 实例可以共享同一个 R2 存储桶。
