import { describe, expect, it, vi } from 'vitest'
import { prepareWorkflowImageDataUrls, WORKFLOW_IMAGE_MAX_COUNT } from './workflowImageInput'

describe('prepareWorkflowImageDataUrls', () => {
  it('uses the persisted thumbnail instead of loading the full original', async () => {
    const loadOriginal = vi.fn(async () => 'data:image/png;base64,b3JpZ2luYWw=')
    await expect(prepareWorkflowImageDataUrls(
      [{ id: 'image-1', dataUrl: 'data:image/png;base64,ZmFsbGJhY2s=' }],
      async () => ({ thumbnailDataUrl: 'data:image/webp;base64,dGh1bWI=' }),
      loadOriginal,
    )).resolves.toEqual(['data:image/webp;base64,dGh1bWI='])
    expect(loadOriginal).not.toHaveBeenCalled()
  })

  it('falls back to the original image when thumbnail generation is unavailable', async () => {
    await expect(prepareWorkflowImageDataUrls(
      [{ id: 'image-1' }],
      async () => undefined,
      async () => 'data:image/jpeg;base64,b3JpZ2luYWw=',
    )).resolves.toEqual(['data:image/jpeg;base64,b3JpZ2luYWw='])
  })

  it('rejects excessive reference image count before reading images', async () => {
    const images = Array.from({ length: WORKFLOW_IMAGE_MAX_COUNT + 1 }, (_, index) => ({ id: `image-${index}` }))
    await expect(prepareWorkflowImageDataUrls(images, async () => undefined, async () => undefined))
      .rejects.toThrow(`工作流最多支持 ${WORKFLOW_IMAGE_MAX_COUNT} 张参考图`)
  })
})