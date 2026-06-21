// Dependency-free PNG icon generator.
// Draws a brand-green tile with a white "plate" circle so the installed app
// icon is recognisable. iOS masks the corners automatically.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const OUT = new URL('../public/', import.meta.url)
mkdirSync(OUT, { recursive: true })

// CRC32
const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

function makePng(size) {
  const bg = [22, 163, 74] // accent green
  const plate = [241, 245, 249] // off-white
  const inner = [203, 213, 225] // slate
  const cx = size / 2
  const cy = size / 2
  const rOuter = size * 0.34
  const rInner = size * 0.22

  const row = size * 3 + 1
  const raw = Buffer.alloc(row * size)
  for (let y = 0; y < size; y++) {
    raw[y * row] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const dx = x - cx
      const dy = y - cy
      const d = Math.sqrt(dx * dx + dy * dy)
      let col = bg
      if (d < rInner) col = inner
      else if (d < rOuter) col = plate
      const o = y * row + 1 + x * 3
      raw[o] = col[0]
      raw[o + 1] = col[1]
      raw[o + 2] = col[2]
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: truecolor
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const [name, size] of [
  ['pwa-192.png', 192],
  ['pwa-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  writeFileSync(new URL(name, OUT), makePng(size))
  console.log('wrote', name, size)
}
