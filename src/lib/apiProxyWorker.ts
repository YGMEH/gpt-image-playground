/**
 * 受控 API 代理的可复用逻辑。
 *
 * 用途：部分中转站（例如挂在 Cloudflare 上的服务）不给浏览器返回 CORS 头，
 * 纯静态部署（GitHub Pages / Vercel 静态托管）无法直接读取 `/v1/models`，
 * 也无法发起带 Authorization 的跨域请求。把本模块部署为用户自己的
 * Cloudflare Worker 后，前端只需把 API URL 指向该 Worker 即可。
 *
 * 安全边界：
 * - 上游地址由部署端的 `UPSTREAM_BASE_URL` 固定，不接受请求方指定，避免变成公开任意代理。
 * - 允许的来源由 `ALLOWED_ORIGINS` 白名单控制，默认不返回任何 CORS 头。
 * - 只放行 GET / POST / OPTIONS，且路径规范化后必须仍落在上游基础路径内。
 */

export interface ApiProxyEnv {
  /** 上游 API 基础地址，通常需要写到版本前缀，如 `https://ai.blue1.top/v1` */
  UPSTREAM_BASE_URL?: string
  /** 允许跨域访问的来源白名单，逗号或空格分隔；`*` 表示任意来源（不建议） */
  ALLOWED_ORIGINS?: string
  /** 可选：由部署端注入上游密钥。设置后浏览器无需持有真实 Key */
  UPSTREAM_API_KEY?: string
}

/** 前端会命中的两种代理前缀：同源部署用 `/api-proxy/`，独立代理用 `/v1/` */
export const API_PROXY_PATH_PREFIXES = ['/api-proxy/', '/v1/'] as const

const ALLOWED_METHODS = ['GET', 'POST', 'OPTIONS'] as const

/** 只透传接口调用真正需要的请求头，避免把 Cookie、CF 内部头等带到上游 */
const FORWARDED_REQUEST_HEADERS = [
  'authorization',
  'x-api-key',
  'x-goog-api-key',
  'content-type',
  'accept',
  'accept-language',
  'openai-beta',
  'openai-organization',
  'anthropic-version',
] as const

export function normalizeUpstreamBaseUrl(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return ''
  const withScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
  } catch {
    return ''
  }
}

export function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(/[\s,]+/)
    .map((item) => item.trim().replace(/\/+$/, ''))
    .filter(Boolean)
}

export function resolveAllowedOrigin(origin: string | null, allowedOrigins: readonly string[]): string | null {
  if (!allowedOrigins.length) return null
  if (allowedOrigins.includes('*')) return origin || '*'
  if (!origin) return null
  const normalized = origin.trim().replace(/\/+$/, '')
  return allowedOrigins.some((item) => item.toLowerCase() === normalized.toLowerCase()) ? origin : null
}

export function buildCorsHeaders(
  origin: string | null,
  allowedOrigins: readonly string[],
  requestedHeaders?: string | null,
): Record<string, string> {
  const allowOrigin = resolveAllowedOrigin(origin, allowedOrigins)
  if (!allowOrigin) return {}
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': ALLOWED_METHODS.join(', '),
    'Access-Control-Allow-Headers': requestedHeaders?.trim() || FORWARDED_REQUEST_HEADERS.join(', '),
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

/** 命中代理前缀时返回去掉前缀后的接口相对路径；否则返回 null（交给静态资源） */
export function matchProxyPath(pathname: string): string | null {
  for (const prefix of API_PROXY_PATH_PREFIXES) {
    if (pathname === prefix.replace(/\/$/, '')) return ''
    if (pathname.startsWith(prefix)) return pathname.slice(prefix.length)
  }
  return null
}

/**
 * 拼接上游地址。路径会先做 URL 规范化，若 `..` 之类的写法逃出上游基础路径则返回 null。
 */
export function buildUpstreamUrl(upstreamBaseUrl: string, endpointPath: string, search = ''): string | null {
  const base = normalizeUpstreamBaseUrl(upstreamBaseUrl)
  if (!base) return null
  const cleanedPath = endpointPath.replace(/^\/+/, '')
  if (!cleanedPath) return null
  let baseUrl: URL
  let target: URL
  try {
    baseUrl = new URL(`${base}/`)
    target = new URL(cleanedPath, baseUrl)
  } catch {
    return null
  }
  if (target.origin !== baseUrl.origin) return null
  if (!target.pathname.startsWith(baseUrl.pathname)) return null
  target.search = search
  return target.toString()
}

export function isAllowedProxyMethod(method: string): boolean {
  return (ALLOWED_METHODS as readonly string[]).includes(method.toUpperCase())
}

function buildUpstreamHeaders(request: Request, env: ApiProxyEnv): Headers {
  const headers = new Headers()
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  const injectedKey = (env.UPSTREAM_API_KEY ?? '').trim()
  if (injectedKey && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${injectedKey}`)
  }
  return headers
}

function withCorsHeaders(source: Headers, cors: Record<string, string>): Headers {
  const headers = new Headers(source)
  // 上游自己的 CORS 头可能与本代理冲突，统一由代理决定。
  for (const name of [...headers.keys()]) {
    if (name.toLowerCase().startsWith('access-control-')) headers.delete(name)
  }
  for (const [name, value] of Object.entries(cors)) headers.set(name, value)
  return headers
}

function jsonError(status: number, message: string, cors: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: { message, type: 'api_proxy_error' } }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
  })
}

/**
 * 处理一次代理请求。返回 null 表示该请求不属于代理路径，调用方应交给静态资源处理。
 */
export async function handleApiProxyRequest(
  request: Request,
  env: ApiProxyEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Response | null> {
  const url = new URL(request.url)
  const endpointPath = matchProxyPath(url.pathname)
  if (endpointPath === null) return null

  const origin = request.headers.get('Origin')
  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS)
  const cors = buildCorsHeaders(origin, allowedOrigins, request.headers.get('Access-Control-Request-Headers'))

  if (request.method.toUpperCase() === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }
  if (!isAllowedProxyMethod(request.method)) {
    return jsonError(405, `方法 ${request.method} 不被 API 代理允许`, cors)
  }
  if (origin && !resolveAllowedOrigin(origin, allowedOrigins)) {
    return jsonError(403, '当前来源未在 ALLOWED_ORIGINS 白名单中', cors)
  }
  const upstreamUrl = buildUpstreamUrl(env.UPSTREAM_BASE_URL ?? '', endpointPath, url.search)
  if (!upstreamUrl) {
    return jsonError(
      env.UPSTREAM_BASE_URL?.trim() ? 400 : 503,
      env.UPSTREAM_BASE_URL?.trim()
        ? '代理路径无效，请检查请求路径是否落在上游基础地址内'
        : '代理未配置上游地址，请设置 UPSTREAM_BASE_URL',
      cors,
    )
  }

  const method = request.method.toUpperCase()
  const init: RequestInit & { duplex?: 'half' } = {
    method,
    headers: buildUpstreamHeaders(request, env),
    redirect: 'follow',
  }
  if (method !== 'GET') {
    init.body = request.body
    init.duplex = 'half'
  }

  let upstreamResponse: Response
  try {
    upstreamResponse = await fetchImpl(upstreamUrl, init)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return jsonError(502, `代理请求上游失败：${message}`, cors)
  }
  // 直接透传 body，保持 SSE / 流式图片可用。
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: withCorsHeaders(upstreamResponse.headers, cors),
  })
}
