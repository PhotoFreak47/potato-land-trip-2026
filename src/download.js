import { downloadZip } from 'client-zip'

// Every download comes in two qualities:
//   sq - the web copy deployed to Pages (2560px JPEG / 1080p MP4).
//   hd - the untouched camera file in Git LFS. Every byte of it counts
//        against the account's LFS bandwidth quota.
const BASE = import.meta.env.BASE_URL
// Set by CI to https://media.githubusercontent.com/media/<owner>/<repo>/<branch>/
// so HD downloads resolve the LFS file. Unset locally / for private repos.
export const ORIGINALS_BASE = import.meta.env.VITE_ORIGINALS_BASE || ''

// ZIPs up to this size are built in memory and saved in one go. Bigger ones
// stream straight to disk where the browser can (Chrome/Edge desktop) and are
// split into parts everywhere else, so a multi-GB HD download can't run a
// phone out of memory.
export const PART_LIMIT_KB = 500 * 1024
// Files fetched ahead of the one being written into the ZIP.
const PREFETCH = 3

export const fileSizeKB = (item, quality) => (quality === 'hd' ? item.originalSizeKB : item.sizeKB)
export const totalKB = (items, quality) => items.reduce((sum, item) => sum + fileSizeKB(item, quality), 0)
const fileUrl = (item, quality) => (quality === 'hd' ? `${ORIGINALS_BASE}${item.original}` : `${BASE}${item.src}`)
const fileName = (item, quality) => (quality === 'hd' ? item.original : item.src).split('/').pop()

const canStreamToDisk = () => typeof window.showSaveFilePicker === 'function'
const streamsToDisk = (items, quality) => totalKB(items, quality) > PART_LIMIT_KB && canStreamToDisk()

// Groups items into ZIPs of at most PART_LIMIT_KB, unless one ZIP can stream to disk.
export function planParts(items, quality) {
  if (totalKB(items, quality) <= PART_LIMIT_KB || canStreamToDisk()) return [items]
  const parts = [[]]
  let size = 0
  for (const item of items) {
    const kb = fileSizeKB(item, quality)
    if (size + kb > PART_LIMIT_KB && parts.at(-1).length) {
      parts.push([])
      size = 0
    }
    parts.at(-1).push(item)
    size += kb
  }
  return parts
}

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

// Saves `items` at `quality`. One item is saved as its own file; several go
// into `<name>.zip`, with a folder per day when they span more than one day.
// Must be called straight from a click: the save dialog needs that gesture.
export async function saveItems({ items, quality, name, signal, onProgress }) {
  const single = items.length === 1
  const parts = single ? [items] : planParts(items, quality)
  const folders = new Set(items.map((item) => item.day)).size > 1
  const entryName = (item) => (folders ? `${item.day}/${fileName(item, quality)}` : fileName(item, quality))

  const handle = streamsToDisk(items, quality)
    ? await window.showSaveFilePicker(
        single
          ? { suggestedName: fileName(items[0], quality) }
          : { suggestedName: `${name}.zip`, types: [{ description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } }] },
      )
    : null

  const totalBytes = totalKB(items, quality) * 1024
  const progress = { bytes: 0, totalBytes, files: 0, totalFiles: items.length, part: 1, parts: parts.length }
  let lastReport = 0
  const report = (now) => {
    if (!now && performance.now() - lastReport < 100) return
    lastReport = performance.now()
    onProgress({ ...progress, bytes: Math.min(progress.bytes, totalBytes) })
  }
  const counted = (body) =>
    body.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          progress.bytes += chunk.byteLength
          report()
          controller.enqueue(chunk)
        },
      }),
    )

  // The ZIP stream only reports a generic "Failed to fetch", so keep the real reason.
  let failure = null
  const open = async (item) => {
    const res = await fetch(fileUrl(item, quality), { signal })
    if (!res.ok) throw new Error(`${item.file} couldn't be downloaded (${res.status})`)
    return res
  }

  // Yields ZIP entries in order while the next few files are already being fetched.
  async function* entries(list) {
    const pending = []
    const start = (i) => {
      if (i >= list.length) return
      pending[i] = open(list[i])
      pending[i].catch(() => {}) // surfaced when awaited below
    }
    for (let i = 0; i < PREFETCH; i++) start(i)
    for (let i = 0; i < list.length; i++) {
      const res = await pending[i].catch((e) => {
        failure ??= e
        throw e
      })
      pending[i] = null
      start(i + PREFETCH)
      yield { name: entryName(list[i]), lastModified: new Date(`${list[i].day}T12:00:00`), input: counted(res.body) }
      progress.files++
      report(true)
    }
  }

  try {
    report(true)
    if (single) {
      const res = await open(items[0])
      const body = counted(res.body)
      if (handle) await body.pipeTo(await handle.createWritable(), { signal })
      else saveBlob(await new Response(body, { headers: res.headers }).blob(), fileName(items[0], quality))
      progress.files = 1
      report(true)
      return
    }
    for (const [i, list] of parts.entries()) {
      progress.part = i + 1
      const zip = downloadZip(entries(list))
      if (handle) await zip.body.pipeTo(await handle.createWritable(), { signal })
      else saveBlob(await zip.blob(), parts.length > 1 ? `${name} part ${i + 1} of ${parts.length}.zip` : `${name}.zip`)
    }
  } catch (e) {
    await handle?.remove?.()?.catch(() => {}) // don't leave a half-written file behind
    throw failure ?? e
  }
}
