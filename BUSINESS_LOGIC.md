# Business & Development Logic

This document describes the *rules* the gallery follows — what happens to a
file from the moment it's added to the moment it's viewable on Pages, and
why. Read this before changing `scripts/generate-manifest.js`,
`.gitattributes`, or the deploy workflow.

> Adapted from `photo-git-template`. The template assumed small JPEGs in
> plain git and no video; real camera output (≈6–12MB JPEG + ≈25MB ARW per
> shot, 4K MP4 clips of 100MB+) breaks both assumptions. Changes from the
> template are marked **(changed)**.

## 1. File intake rules (changed)

| File lands in... | Format | Storage | Ends up on Pages? |
| --- | --- | --- | --- |
| `originals/<YYYY-MM-DD>/` | camera `.JPG`, `.ARW`, `.MP4` (as shot) | **Git LFS** (path rule in `.gitattributes`) | No — backup / source of truth |
| `public/media/thumbs/<day>/` | `.jpg`, 800px | plain git, **generated** | Yes — grid tiles and video posters |
| `public/media/large/<day>/` | `.jpg`, 2560px q85 | plain git, **generated** | Yes — lightbox + "Web size" download |
| `public/media/video/<day>/` | `.mp4`, 1080p H.264 | plain git, **generated** | Yes — in-page video player |

Why everything under `originals/` is LFS, including JPEGs:

- Camera MP4s are 100–165MB. GitHub **rejects** any plain-git file over 100MB.
- Camera JPEGs for one trip total >1GB. In plain git under `public/` they
  would exceed the 1GB GitHub Pages site limit and bloat clone size forever.
- Day folders keep each JPEG next to its RAW twin, as the camera produced them.

Why `public/media/` must **not** be LFS: CI checks out with `lfs: false`, so an
LFS-tracked web file would be deployed as a 130-byte pointer and break the
page. The deploy workflow fails the build if it finds pointer files there.

## 2. Derivative generation logic (changed)

`npm run manifest` runs **locally only**. CI cannot run it, because the
originals live in LFS and are not downloaded in CI. Its output
(`public/media/**`, `public/manifest.json`) is therefore **committed**, and
`npm run build` no longer regenerates it.

For each day folder in `originals/`:

- **Photos** (`.jpg/.jpeg`): apply EXIF orientation, write an 800px thumb and
  a 2560px "large" copy (never upscaled). RAW files are ignored; they are backup only.
- **Videos** (`.mp4/.mov/.mts/.m4v`): transcode with the bundled
  `ffmpeg-static` to ≤1920px H.264 CRF 24 + AAC, `+faststart` so playback
  starts while downloading; grab a poster frame at 1s. A warning prints if a
  web copy goes over 50MB.
- Incremental: an output is skipped if it is newer than its source
  (`--force` rebuilds all).
- LFS pointer files (originals not pulled) are skipped with a warning
  instead of crashing.
- Manifest item: `{type, id, day, file, original, thumb, src, width, height, duration?, sizeKB, originalSizeKB, tags}`.

Tuning levers are the constants at the top of the script (`THUMB_WIDTH`,
`LARGE_WIDTH`, `*_QUALITY`, `VIDEO_MAX_WIDTH`, `VIDEO_CRF`).

## 3. Deploy trigger logic

- Trigger: push to `main`, or manual `workflow_dispatch`.
- `VITE_BASE_PATH=/<repo-name>/` is set from `github.event.repository.name`.
- **(changed)** A guard step fails the build if `public/manifest.json` is
  missing or `public/` contains LFS pointers.
- **(changed)** `VITE_ORIGINALS_BASE` is set to
  `https://media.githubusercontent.com/media/<owner>/<repo>/<branch>/` for
  public repos, which turns on the "Original from camera" download.
- LFS checkout stays **off**, so deploys use none of the LFS bandwidth quota.

## 4. Download vs. share logic (changed)

- **Download** opens a menu:
  1. *Web size* (2560px JPEG, or 1080p MP4) is served from Pages and always available.
  2. *Original from camera* is the untouched LFS file, linked through
     `media.githubusercontent.com`. It only appears for public repos, and
     **every click uses the account's LFS bandwidth quota**.
- **Share**: native share sheet if available, else WhatsApp / X / Facebook /
  copy link. Shared URLs point at the web copy on Pages, not at LFS, so
  social previews never use LFS bandwidth.
- **(new)** The gallery is grouped by day, has an All/Photos/Videos filter,
  and the lightbox has prev/next buttons (arrow keys also work). Videos play inline.

## 5. Cost / size model

| Resource | Limit (check current GitHub docs and Settings → Billing) | This design |
| --- | --- | --- |
| Plain-git file size | 100MB hard block | Largest generated file is ~17MB |
| Pages site size | 1GB | ~135MB per trip (web copies only) |
| Pages bandwidth | ~100GB/month soft | Visitors load 800px thumbs first; large copies only when opened |
| LFS storage | Free quota is per account, shared by all repos | **All originals count**: a trip of RAW+JPEG+4K video is several GB |
| LFS bandwidth | Per account, monthly | Used only by `git lfs pull`/clone and "Original" downloads, never by CI or normal viewing |

LFS storage is the one real cost. If the account goes over its free LFS
quota, either pay for more, or keep RAW/video originals backed up outside
GitHub and commit only `public/` plus the JPEG originals.

## 6. Per-trip lifecycle

1. One repo per trip/event (clean history, independent quotas and size).
2. Put the camera's day folders under `originals/` and run `npm run manifest`.
3. Commit `originals/` (LFS) together with `public/` (generated) and push to `main`.
4. Actions checks the generated media, builds, and deploys to Pages.
