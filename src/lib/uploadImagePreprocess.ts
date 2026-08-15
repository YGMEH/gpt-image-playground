import { blobToDataUrl } from './dataUrl'
export const UPLOAD_IMAGE_MAX_BYTES = 10 * 1024 * 1024
export const UPLOAD_IMAGE_MAX_DIMENSION = 4096
export const UPLOAD_IMAGE_FILE_ACCEPT = [
  'image/*',
  '.dng', '.cr2', '.cr3', '.nef', '.nrw', '.arw', '.srf', '.sr2',
  '.orf', '.rw2', '.raf', '.pef', '.raw', '.rwl', '.3fr', '.erf',
  '.heic', '.heif', '.tif', '.tiff',
].join(',')


const DIRECT_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const DIRECT_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp'])
const CONVERTIBLE_IMAGE_EXTENSIONS = new Set([
  'gif', 'bmp', 'avif', 'heic', 'heif', 'tif', 'tiff',
  'dng', 'cr2', 'cr3', 'nef', 'nrw', 'arw', 'srf', 'sr2',
  'orf', 'rw2', 'raf', 'pef', 'raw', 'rwl', '3fr', 'erf',
])
const RAW_IMAGE_EXTENSIONS = new Set([
  'dng', 'cr2', 'cr3', 'nef', 'nrw', 'arw', 'srf', 'sr2',
  'orf', 'rw2', 'raf', 'pef', 'raw', 'rwl', '3fr', 'erf',
])

export interface PreparedUploadImage {
  file: File
  dataUrl: string
  converted: boolean
  originalBytes: number
  outputBytes: number
}

function getFileExtension(name: string) {
  return name.split('.').pop()?.trim().toLowerCase() ?? ''
}

export function isSupportedUploadImageFile(file: Pick<File, 'name' | 'type'>) {
  const extension = getFileExtension(file.name)
  return file.type.startsWith('image/') || DIRECT_IMAGE_EXTENSIONS.has(extension) || CONVERTIBLE_IMAGE_EXTENSIONS.has(extension)
}

/** 浏览器可解码的 JPEG 帧类型：基线、扩展顺序、渐进 */
const BROWSER_DECODABLE_SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2])
/** 全部 SOF 帧标记（0xc4/0xc8/0xcc 是 DHT/JPG/DAC，不属于 SOF） */
const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3,
  0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb,
  0xcd, 0xce, 0xcf,
])

interface JpegFrameInfo {
  width: number
  height: number
  /** 浏览器能否解码该帧（RAW 里的 14bit 无损 JPEG 不能） */
  decodable: boolean
}

/** 从 SOI 位置解析 JPEG 段链，读取首个 SOF 帧信息 */
function readJpegFrameInfo(bytes: Uint8Array, soiOffset: number): JpegFrameInfo | null {
  let offset = soiOffset + 2

  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) return null

    let marker = bytes[offset + 1]
    // 连续填充的 0xff 需要跳过
    while (marker === 0xff && offset + 2 < bytes.length) {
      offset += 1
      marker = bytes[offset + 1]
    }

    // 无参数段
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      offset += 2
      continue
    }
    // 到了扫描数据或结束标记仍未找到 SOF
    if (marker === 0xda || marker === 0xd9) return null

    const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3]
    if (segmentLength < 2) return null

    if (JPEG_SOF_MARKERS.has(marker)) {
      if (offset + 9 >= bytes.length) return null
      const precision = bytes[offset + 4]
      const height = (bytes[offset + 5] << 8) | bytes[offset + 6]
      const width = (bytes[offset + 7] << 8) | bytes[offset + 8]
      const components = bytes[offset + 9]
      return {
        width,
        height,
        decodable:
          BROWSER_DECODABLE_SOF_MARKERS.has(marker) &&
          precision === 8 &&
          (components === 1 || components === 3),
      }
    }

    offset += 2 + segmentLength
  }

  return null
}

function findJpegEndOffset(bytes: Uint8Array, soiOffset: number) {
  for (let i = soiOffset + 2; i < bytes.length - 1; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd9) return i + 2
  }
  return -1
}

/**
 * 提取 RAW 文件中「浏览器能解码」且像素最多的内嵌 JPEG 预览。
 * 相机 RAW（如 CR2）里体积最大的内嵌 JPEG 往往是 14bit 无损 JPEG，浏览器无法解码，
 * 因此这里按帧类型筛选，再按像素数取最大，而不是简单取最大字节段。
 */
export function findLargestDecodableEmbeddedJpeg(bytes: Uint8Array): Uint8Array | null {
  let best: { start: number; end: number; pixels: number } | null = null

  for (let i = 0; i < bytes.length - 1; i++) {
    if (bytes[i] !== 0xff || bytes[i + 1] !== 0xd8) continue

    const end = findJpegEndOffset(bytes, i)
    if (end < 0) break

    const info = readJpegFrameInfo(bytes, i)
    if (info?.decodable && info.width > 0 && info.height > 0) {
      const pixels = info.width * info.height
      if (!best || pixels > best.pixels) best = { start: i, end, pixels }
    }

    i = end - 2
  }

  return best ? bytes.slice(best.start, best.end) : null
}

async function decodeBlob(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image' })
    } catch {
      // Fall through for browsers that decode this format only through <img>.
    }
  }

  const objectUrl = URL.createObjectURL(blob)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('当前浏览器无法解码该图片格式'))
      image.src = objectUrl
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function getDecodedSize(image: ImageBitmap | HTMLImageElement) {
  const width = 'naturalWidth' in image ? image.naturalWidth : image.width
  const height = 'naturalHeight' in image ? image.naturalHeight : image.height
  if (!width || !height) throw new Error('图片尺寸无效')
  return { width, height }
}

function closeDecodedImage(image: ImageBitmap | HTMLImageElement) {
  if ('close' in image && typeof image.close === 'function') image.close()
}

function createJpegCanvas(image: ImageBitmap | HTMLImageElement, maxDimension: number) {
  const { width, height } = getDecodedSize(image)
  const scale = Math.min(1, maxDimension / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前浏览器不支持 Canvas 图片转换')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('图片转 JPG 失败'))
      else resolve(blob)
    }, 'image/jpeg', quality)
  })
}

async function encodeJpegWithinLimit(image: ImageBitmap | HTMLImageElement) {
  let maxDimension = UPLOAD_IMAGE_MAX_DIMENSION
  let canvas = createJpegCanvas(image, maxDimension)

  for (let resizeAttempt = 0; resizeAttempt < 6; resizeAttempt++) {
    for (const quality of [0.92, 0.85, 0.76, 0.66, 0.56, 0.46]) {
      const blob = await canvasToJpeg(canvas, quality)
      if (blob.size <= UPLOAD_IMAGE_MAX_BYTES) return blob
    }

    maxDimension = Math.max(1024, Math.floor(maxDimension * 0.78))
    if (Math.max(canvas.width, canvas.height) <= maxDimension) break
    canvas = createJpegCanvas(image, maxDimension)
  }

  const blob = await canvasToJpeg(canvas, 0.4)
  if (blob.size > UPLOAD_IMAGE_MAX_BYTES) {
    throw new Error('图片压缩后仍超过 10 MiB，请先缩小图片尺寸')
  }
  return blob
}

async function getDecodableSource(file: File, extension: string) {
  try {
    const image = await decodeBlob(file)
    return { image, sourceBlob: file }
  } catch (originalError) {
    if (!RAW_IMAGE_EXTENSIONS.has(extension)) throw originalError
    const preview = findLargestDecodableEmbeddedJpeg(new Uint8Array(await file.arrayBuffer()))
    if (!preview || preview.byteLength < 4 * 1024) {
      throw new Error(`无法解码 ${extension.toUpperCase()}：文件中没有可用的 JPEG 预览图`)
    }
    const previewBuffer = new ArrayBuffer(preview.byteLength)
    new Uint8Array(previewBuffer).set(preview)
    const sourceBlob = new Blob([previewBuffer], { type: 'image/jpeg' })
    return { image: await decodeBlob(sourceBlob), sourceBlob }
  }
}

export async function prepareUploadImage(file: File): Promise<PreparedUploadImage> {
  if (!isSupportedUploadImageFile(file)) throw new Error(`${file.name || '文件'}不是支持的图片格式`)

  const extension = getFileExtension(file.name)
  const directFormat = DIRECT_IMAGE_MIMES.has(file.type.toLowerCase()) || DIRECT_IMAGE_EXTENSIONS.has(extension)
  if (directFormat && file.size <= UPLOAD_IMAGE_MAX_BYTES) {
    const image = await decodeBlob(file)
    try {
      const { width, height } = getDecodedSize(image)
      if (Math.max(width, height) <= UPLOAD_IMAGE_MAX_DIMENSION) {
        return {
          file,
          dataUrl: await blobToDataUrl(file, file.type || 'image/jpeg'),
          converted: false,
          originalBytes: file.size,
          outputBytes: file.size,
        }
      }
    } finally {
      closeDecodedImage(image)
    }
  }

  const { image } = await getDecodableSource(file, extension)
  try {
    const outputBlob = await encodeJpegWithinLimit(image)
    const outputName = `${file.name.replace(/\.[^.]+$/, '') || 'image'}.jpg`
    const outputFile = new File([outputBlob], outputName, { type: 'image/jpeg', lastModified: file.lastModified })
    return {
      file: outputFile,
      dataUrl: await blobToDataUrl(outputBlob, 'image/jpeg'),
      converted: true,
      originalBytes: file.size,
      outputBytes: outputBlob.size,
    }
  } finally {
    closeDecodedImage(image)
  }
}
