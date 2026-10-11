// Scans originals/<day>/ for camera JPEGs and videos and writes small,
// web-servable copies into public/media/ plus public/manifest.json.
//
//   originals/2026-08-27/DSC04415.JPG  ->  public/media/thumbs/2026-08-27/DSC04415.jpg  (grid)
//                                      ->  public/media/large/2026-08-27/DSC04415.jpg   (lightbox + download)
//   originals/2026-08-28/C0003.MP4     ->  public/media/video/2026-08-28/C0003.mp4      (1080p H.264)
//                                      ->  public/media/thumbs/2026-08-28/C0003.jpg     (poster)
//
// originals/ is Git LFS and is NOT available in CI (checkout uses lfs:false),
// so this script runs locally and its output is committed. RAW files (.ARW
// etc.) sit next to their JPEGs in originals/ purely as backup and are ignored.
//
// Usage: npm run manifest           (incremental: skips up-to-date outputs)
//        npm run manifest -- --force (rebuild every derivative)

import { readdir, mkdir, stat, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import sharp from 'sharp'
import ffmpegPath from 'ffmpeg-static'

const run = promisify(execFile)

const ORIGINALS_DIR = path.resolve('originals')
const MEDIA_DIR = path.resolve('public/media')
const MANIFEST_PATH = path.resolve('public/manifest.json')

const THUMB_WIDTH = 800 // px, grid tiles
const LARGE_WIDTH = 2560 // px, lightbox + download; originals stay in LFS
const THUMB_QUALITY = 75
const LARGE_QUALITY = 85
const VIDEO_MAX_WIDTH = 1920 // 1080p web copy of the 4K camera files
const VIDEO_CRF = 24 // higher = smaller file
const PUBLIC_FILE_WARN_MB = 50 // GitHub warns at 50MB, blocks at 100MB

const PHOTO_RE = /\.(jpe?g)$/i
const VIDEO_RE = /\.(mp4|mov|mts|m4v)$/i

// Gallery title: package.json "displayName", else the folder name.
const pkg = JSON.parse(await readFile("package.json", "utf8"))
const TRIP_NAME = process.env.TRIP_NAME || pkg.displayName || path.basename(process.cwd())
const FORCE = process.argv.includes('--force')

// An LFS checkout made with GIT_LFS_SKIP_SMUDGE leaves tiny pointer files
// instead of media; detect them so we skip instead of crashing in sharp/ffmpeg.
async function isLfsPointer(file) {
  const { size } = await stat(file)
  if (size > 1024) return false
  const head = (await readFile(file, 'utf8')).slice(0, 40)
  return head.startsWith('version https://git-lfs')
}

async function isFresh(src, out) {
  if (FORCE || !existsSync(out)) return false
  const [s, o] = await Promise.all([stat(src), stat(out)])
  return o.mtimeMs >= s.mtimeMs
}

const rel = (p) => path.relative(path.resolve('public'), p).split(path.sep).join('/')

async function processPhoto(day, file) {
  const src = path.join(ORIGINALS_DIR, day, file)
  const base = file.replace(PHOTO_RE, '')
  const thumb = path.join(MEDIA_DIR, 'thumbs', day, `${base}.jpg`)
  const large = path.join(MEDIA_DIR, 'large', day, `${base}.jpg`)

  // .rotate() applies EXIF orientation so portrait shots aren't sideways.
  if (!(await isFresh(src, thumb))) {
    await sharp(src).rotate()
      .resize({ width: THUMB_WIDTH, height: THUMB_WIDTH, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: THUMB_QUALITY, mozjpeg: true })
      .toFile(thumb)
  }
  if (!(await isFresh(src, large))) {
    await sharp(src).rotate()
      .resize({ width: LARGE_WIDTH, height: LARGE_WIDTH, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: LARGE_QUALITY, mozjpeg: true })
      .toFile(large)
  }

  const meta = await sharp(large).metadata()
  return {
    type: 'photo',
    id: `${day}/${base}`,
    day,
    file,
    original: `originals/${day}/${file}`,
    thumb: rel(thumb),
    src: rel(large),
    width: meta.width,
    height: meta.height,
    sizeKB: Math.round((await stat(large)).size / 1024),
    originalSizeKB: Math.round((await stat(src)).size / 1024),
    tags: [],
  }
}

async function processVideo(day, file) {
  const src = path.join(ORIGINALS_DIR, day, file)
  const base = file.replace(VIDEO_RE, '')
  const video = path.join(MEDIA_DIR, 'video', day, `${base}.mp4`)
  const thumb = path.join(MEDIA_DIR, 'thumbs', day, `${base}.jpg`)

  if (!(await isFresh(src, video))) {
    console.log(`  transcoding ${day}/${file} (this takes a while)...`)
    await run(ffmpegPath, [
      '-y', '-loglevel', 'error', '-i', src,
      '-vf', `scale='min(${VIDEO_MAX_WIDTH},iw)':-2`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', String(VIDEO_CRF), '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart', // playback starts before the whole file downloads
      video,
    ], { maxBuffer: 1 << 26 })
  }
  if (!(await isFresh(src, thumb))) {
    const { stdout } = await run(ffmpegPath, [
      '-loglevel', 'error', '-ss', '1', '-i', video, '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', '-',
    ], { encoding: 'buffer', maxBuffer: 1 << 28 })
    await sharp(stdout)
      .resize({ width: THUMB_WIDTH, height: THUMB_WIDTH, fit: 'inside' })
      .jpeg({ quality: THUMB_QUALITY, mozjpeg: true })
      .toFile(thumb)
  }

  const meta = await sharp(thumb).metadata()
  // `ffmpeg -i` with no output always exits non-zero; the info we want is on stderr.
  const probe = await run(ffmpegPath, ['-i', video]).catch((e) => e)
  const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(String(probe.stderr ?? ''))
  const sizeKB = Math.round((await stat(video)).size / 1024)
  if (sizeKB / 1024 > PUBLIC_FILE_WARN_MB) {
    console.warn(`  WARNING: ${rel(video)} is ${Math.round(sizeKB / 1024)}MB - raise VIDEO_CRF or lower VIDEO_MAX_WIDTH`)
  }
  return {
    type: 'video',
    id: `${day}/${base}`,
    day,
    file,
    original: `originals/${day}/${file}`,
    thumb: rel(thumb),
    src: rel(video),
    width: meta.width,
    height: meta.height,
    duration: d ? Math.round(+d[1] * 3600 + +d[2] * 60 + +d[3]) : undefined,
    sizeKB,
    originalSizeKB: Math.round((await stat(src)).size / 1024),
    tags: [],
  }
}

async function main() {
  if (!existsSync(ORIGINALS_DIR)) {
    console.error('No originals/ directory found. Add day folders (originals/YYYY-MM-DD/) first.')
    process.exit(1)
  }

  const days = (await readdir(ORIGINALS_DIR, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()

  const items = []
  let skipped = 0
  for (const day of days) {
    const files = (await readdir(path.join(ORIGINALS_DIR, day))).sort()
    const media = files.filter((f) => PHOTO_RE.test(f) || VIDEO_RE.test(f))
    if (media.length === 0) continue
    console.log(`${day}: ${media.length} item(s)`)
    for (const sub of ['thumbs', 'large', 'video']) {
      await mkdir(path.join(MEDIA_DIR, sub, day), { recursive: true })
    }
    for (const file of media) {
      if (await isLfsPointer(path.join(ORIGINALS_DIR, day, file))) {
        skipped++
        continue
      }
      items.push(PHOTO_RE.test(file) ? await processPhoto(day, file) : await processVideo(day, file))
    }
  }

  if (skipped) {
    console.warn(`Skipped ${skipped} LFS pointer file(s) - run "git lfs pull" to fetch originals first.`)
    if (existsSync(MANIFEST_PATH) && items.length === 0) {
      console.warn('Keeping existing manifest.json unchanged.')
      return
    }
  }

  const manifest = {
    tripName: TRIP_NAME,
    generatedAt: new Date().toISOString(),
    days: [...new Set(items.map((i) => i.day))],
    counts: {
      photos: items.filter((i) => i.type === 'photo').length,
      videos: items.filter((i) => i.type === 'video').length,
    },
    items,
  }
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2))
  console.log(`Wrote manifest.json: ${manifest.counts.photos} photo(s), ${manifest.counts.videos} video(s) -> ${MANIFEST_PATH}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
