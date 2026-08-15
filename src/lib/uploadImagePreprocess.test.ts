import { describe, expect, it } from 'vitest'
import { findLargestDecodableEmbeddedJpeg } from './uploadImagePreprocess'

/** 构造一个最小 JPEG：SOI + SOF(marker) + EOI */
function makeJpeg(marker: number, width: number, height: number, precision: number, components: number, padBytes = 0) {
  const head = [0xff, 0xd8]
  const sofLength = 8 + components * 3
  const sof = [0xff, marker, (sofLength >> 8) & 0xff, sofLength & 0xff, precision, (height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff, components]
  for (let i = 0; i < components; i++) sof.push(i + 1, 0x11, 0x00)
  const pad = new Array(padBytes).fill(0x00)
  return new Uint8Array([...head, ...sof, ...pad, 0xff, 0xd9])
}

function concat(...parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.byteLength
  }
  return out
}

describe('findLargestDecodableEmbeddedJpeg', () => {
  it('skips 14-bit lossless JPEG and picks the largest baseline preview', () => {
    const thumb = makeJpeg(0xc0, 160, 120, 8, 3, 64)
    const preview = makeJpeg(0xc0, 6000, 4000, 8, 3, 128)
    // CR2 里体积最大的其实是 14bit 无损 JPEG（SOF3，2 分量），浏览器无法解码
    const lossless = makeJpeg(0xc3, 4056, 3048, 14, 2, 4096)

    const picked = findLargestDecodableEmbeddedJpeg(concat(thumb, preview, lossless))

    expect(picked).not.toBeNull()
    expect(Array.from(picked!)).toEqual(Array.from(preview))
  })

  it('accepts progressive JPEG previews', () => {
    const progressive = makeJpeg(0xc2, 1024, 768, 8, 3, 32)

    expect(findLargestDecodableEmbeddedJpeg(progressive)).not.toBeNull()
  })

  it('returns null when only undecodable frames exist', () => {
    const lossless = makeJpeg(0xc3, 4056, 3048, 14, 2, 256)

    expect(findLargestDecodableEmbeddedJpeg(lossless)).toBeNull()
  })
})
