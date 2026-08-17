import { getDataUrlDecodedByteSize } from './imageApiShared'

export const WORKFLOW_IMAGE_MAX_COUNT = 8
export const WORKFLOW_IMAGE_MAX_TOTAL_BYTES = 6 * 1024 * 1024

type WorkflowInputImage = { id: string; dataUrl?: string }
type WorkflowThumbnail = { thumbnailDataUrl?: string } | null | undefined

function formatMiB(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`
}

/**
 * 工作流只需要视觉模型读图并产出文字提示词，不需要把生图原图完整上传。
 * 优先使用持久化的 720px 缩略图，既保留构图/材质语义，也避免 Base64 JSON
 * 膨胀后触发中转站或上游的请求体限制。缩略图不可用时才回退原图。
 */
export async function prepareWorkflowImageDataUrls(
  images: WorkflowInputImage[],
  loadThumbnail: (id: string) => Promise<WorkflowThumbnail>,
  loadOriginal: (id: string) => Promise<string | null | undefined>,
): Promise<string[]> {
  if (images.length > WORKFLOW_IMAGE_MAX_COUNT) {
    throw new Error(`工作流最多支持 ${WORKFLOW_IMAGE_MAX_COUNT} 张参考图，请减少图片后重试`)
  }

  const dataUrls: string[] = []
  let totalBytes = 0
  for (const image of images) {
    const thumbnail = await loadThumbnail(image.id)
    const dataUrl = thumbnail?.thumbnailDataUrl || await loadOriginal(image.id) || image.dataUrl
    if (!dataUrl) continue
    totalBytes += getDataUrlDecodedByteSize(dataUrl)
    if (totalBytes > WORKFLOW_IMAGE_MAX_TOTAL_BYTES) {
      throw new Error(`工作流参考图总大小仍过大（${formatMiB(totalBytes)}），请减少图片后重试`)
    }
    dataUrls.push(dataUrl)
  }
  return dataUrls
}
