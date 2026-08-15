/**
 * 灵感画廊的类型与轻量元数据（不含 100 条示例正文）。
 *
 * 示例正文放在 inspirationPrompts.ts（约 180KB），只在打开灵感画廊时动态 import，
 * 避免拖慢首屏。数据来源与署名见该文件头部注释。
 */

export interface InspirationPrompt {
  /** 稳定 id，awgi-<案例编号> */
  id: string
  /** 中文标题 */
  title: string
  /** 英文标题 */
  titleEn?: string
  /** 中文提示词（缺失时回退英文） */
  prompt: string
  /** 英文提示词 */
  promptEn?: string
  /** 使用说明 */
  note?: string
  /** 参考图要求说明 */
  referenceNote?: string
  /** 原作者 */
  author?: string
  /** 原作者主页 */
  authorLink?: string
  /** 原始发布链接 */
  sourceLink?: string
  /** 示例图（GitHub raw，懒加载） */
  imageUrl?: string
  /** 案例目录地址 */
  caseUrl: string
  /** 分类标签 */
  tags: string[]
  /** 是否需要上传参考图才能复现 */
  needsReference: boolean
}

export const INSPIRATION_SOURCE = {
  name: 'awesome-gpt4o-images',
  author: 'Jamez Bondos',
  repoUrl: 'https://github.com/jamez-bondos/awesome-gpt4o-images',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
} as const

/** 分类标签（本项目按规则生成，顺序即展示顺序） */
export const INSPIRATION_TAGS: string[] = ['3D/手办', 'Q版/卡通', '插画/漫画', '人像/写真', '海报/平面', '产品/电商', '场景/风景', '文字/信息图', '像素/复古', '其他风格']

/** 内置示例总数，用于未加载时展示提示文案 */
export const INSPIRATION_PROMPT_COUNT = 100

/**
 * 本地缩略图目录（public/inspiration）。
 * 缩略图由原仓库示例图等比缩到 480px 宽、转 WebP q72 生成，平均约 20KB，
 * 随应用一起分发，打开画廊即时显示，不依赖外网。
 */
export function getInspirationThumbUrl(id: string) {
  return `${import.meta.env.BASE_URL}inspiration/${id}.webp`
}

const JSDELIVR_PREFIX = 'https://cdn.jsdelivr.net/gh/jamez-bondos/awesome-gpt4o-images@main/'
const RAW_PREFIX = 'https://raw.githubusercontent.com/jamez-bondos/awesome-gpt4o-images/main/'

/**
 * 远程原图候选地址（jsDelivr 优先，失败回退 GitHub raw）。
 * 用于点击缩略图后放大展示，缩略图只有 480px 宽，不适合大图。
 */
export function getInspirationOriginalUrls(item: InspirationPrompt): string[] {
  if (!item.imageUrl) return []
  const list = [item.imageUrl]
  const rawFallback = item.imageUrl.replace(JSDELIVR_PREFIX, RAW_PREFIX)
  if (rawFallback !== item.imageUrl) list.push(rawFallback)
  return list
}

/** 缩略图候选地址：本地 WebP → jsDelivr → raw */
export function getInspirationThumbUrls(item: InspirationPrompt): string[] {
  return [getInspirationThumbUrl(item.id), ...getInspirationOriginalUrls(item)]
}

let cache: InspirationPrompt[] | null = null
let pending: Promise<InspirationPrompt[]> | null = null

/** 按需加载灵感画廊数据，重复调用复用同一个 Promise */
export function loadInspirationPrompts(): Promise<InspirationPrompt[]> {
  if (cache) return Promise.resolve(cache)
  if (!pending) {
    pending = import('./inspirationPrompts')
      .then((mod) => {
        cache = mod.INSPIRATION_PROMPTS
        return cache
      })
      .catch((error) => {
        pending = null
        throw error
      })
  }
  return pending
}

/** 已加载则同步返回，未加载返回 null（供首帧渲染判断） */
export function getLoadedInspirationPrompts() {
  return cache
}
