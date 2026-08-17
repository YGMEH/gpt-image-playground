/**
 * Cloudflare Worker 入口。
 *
 * 同时承担两件事：
 * 1. 把 `dist/` 静态资源交给 Cloudflare Assets 处理（SPA fallback）。
 * 2. 对 `/api-proxy/*` 与 `/v1/*` 提供受控的同源 API 代理，解决中转站不开放 CORS 的问题。
 *
 * 需要在部署端配置的变量（wrangler secret / 变量）：
 * - `UPSTREAM_BASE_URL`：上游 API 基础地址，需写到版本前缀，如 `https://ai.blue1.top/v1`
 * - `ALLOWED_ORIGINS`：允许的来源白名单，如 `https://ygmeh.github.io,https://你的域名`
 * - `UPSTREAM_API_KEY`（可选）：由服务端注入上游密钥，浏览器就不必持有真实 Key
 */
import { handleApiProxyRequest, type ApiProxyEnv } from './lib/apiProxyWorker'

interface WorkerEnv extends ApiProxyEnv {
  ASSETS?: { fetch: (request: Request) => Promise<Response> }
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const proxied = await handleApiProxyRequest(request, env)
    if (proxied) return proxied
    if (env.ASSETS) return env.ASSETS.fetch(request)
    return new Response('Not Found', { status: 404 })
  },
}
