# 🎨 GPT Image Playground

基于 OpenAI gpt-image-2 API 的图片生成与编辑工具

## 🔒 Sponsor

<a href="https://example.com/affiliate/z95r"><img src="https://github.com/user-attachments/assets/b5b14eaa-8f24-41fd-89aa-d681400a3c84" alt="摸鱼 AI" width="150"></a>

## ✨ Features

- Agent多轮对话与上下文记忆：基于Responses API的对话式生成，Agent会理解上下文并按需调用图像工具
- 并发批量生成、分支与重新生成、画廊同步与隔离删除、可选Web搜索
- 精细化参数追踪、实际参数对比、大量自定义预设支持
- 纯本地化历史记录和图片（IndexDB）管理，收藏夹管理，高效操作
- 多配置与服务商增强、自定义JSON导入的API服务商兼容方案
- API代理来解决浏览器CORS问题
- 提示词防改写、智能诊断提示和有效的方案处理

## 🚀 部署与使用

<detail>
<summary><b>Vercel 一键部署 (推荐)</b></summary>

> 此项目并非自动挡，但仓库本身已配置好`vercel.json`，可通过GitHub直接推送到Vercel进行部署。

**配置 VITE_DEFAULT_API_URL**：在 Vercel 项目的 **Settings → Environment Variables** 中添加，然后重新部署。该变量支持三种填法：
1. 普通API地址（如 `https://api.openai.com/v1`）→ 页面打开时自动填入默认API地址。
2. **带参数的应用链接**（如 `https://你的域名?apiUrl=...&model=...`）→ 同时预设API地址、API Key、模型等多个字段。**可用参数见：[URL传参快速填充](#url-quick-fill)。**
3. **自定义服务商链接**（公开可访问的`.json`文件地址，或含 `?settings={URL编码后的JSON}`参数的分享链接）→ 页面启动时自动导入自定义服务商，不会把该链接当作API请求地址。**配置和示例见：[自定义服务商](#custom-provider-config)。**

**仅展示默认配置**：设置 `VITE_SHOW_DEFAULT_CONFIG_ONLY=true` 后，前端会隐藏多配置切换和服务商类型切换，只允许使用默认配置。

绑定自定义域名（国内直连）：Vercel 默认分配的 `.vercel.app` 域名在国内通常无法直接访问。如果你希望在国内直连访问，请在 Vercel 项目的 **Settings → Domains** 中绑定你自己的域名。

**配置自动更新**：本项目已在 `vercel.json` 中关闭了默认的自动部署。若需在同步GitHub上游代码后自动更新Vercel部署：
1. 在 Vercel 项目设置 **Settings -> Git** 的 **Deploy Hooks** 中创建一个名为 `Release` 的 Hook（Branch填 `main`）并复制生成的URL。
2. 在你 Fork 的 GitHub 仓库设置 **Settings -> Secrets and variables -> Actions** 中，新建Secret `VERCEL_DEPLOY_HOOK`，填入刚在的URL。

此后，每当GitHub点击 **Sync fork** 同步包含新Release的上游代码时，都会自动触发的Vercel构建和部署。普通提交不会触发部署。
</detail>

<figure>
<img src="https://github.com/user-attachments/assets/025f43a0-2451-4103-a570-6ed2c1ba18d3" alt="GitHub Sponsors" width="150">
</figure>

## 🔒 安全提示

- **ALLOWED_ORIGINS 必须填写具体来源。填 `*` 会让任何网站都能借你的代理消耗上游额度。**
- 代理只放行 `GET` / `POST` / `OPTIONS`，且路径必须落在 `UPSTREAM_BASE_URL` 之内，`..` 之类的写法会被拒绝。
- 上游密钥请通过 `wrangler secret` 或容器环境变量注入，不要写进仓库或 `VITE_*` 前端变量（`VITE_*` 会被打包进公开的JS文件）。
- 如果 Key 曾经出现在聊天记录、截图或日志里，请立刻在服务商后台撤销并重建。

## 🤝 贡献
欢迎提交 Issue 和 Pull Request。

项目使用 [MIT License](LICENSE) 许可，欢迎 Star ⭐、打赏 🪙！