# Ireland Trip 2026 — photo & video gallery

A React + Material UI gallery built from `photo-git-template`. Camera
originals are backed up with Git LFS, web-sized copies are deployed to
GitHub Pages, and viewers can browse by day, play videos, download, or share.

See [BUSINESS_LOGIC.md](BUSINESS_LOGIC.md) for the rules and the reasons behind them.

## Repo layout

```text
originals/<YYYY-MM-DD>/   camera files as shot: .JPG + .ARW + .MP4  (Git LFS, never served)
public/media/thumbs/      800px grid thumbs + video posters          (generated, committed)
public/media/large/       2560px lightbox/download copies            (generated, committed)
public/media/video/       1080p H.264 web copies of camera videos    (generated, committed)
public/manifest.json      gallery index                              (generated, committed)
scripts/generate-manifest.js   builds everything in public/ from originals/
src/                      the React/MUI app
```

## Setup (per machine)

```bash
git lfs install
npm install          # also downloads an ffmpeg binary (ffmpeg-static) for video
git lfs pull         # only needed after a fresh clone, to regenerate media
```

If `npm run manifest` fails with "not a valid application" / "Exec format
error", the ffmpeg download was cut off. Run
`rm node_modules/ffmpeg-static/ffmpeg* && node node_modules/ffmpeg-static/install.js`
and try again.

## Adding photos / videos

1. Copy the camera's day folder into `originals/` (e.g. `originals/2026-09-05/`).
2. `npm run manifest` (incremental; `npm run manifest -- --force` rebuilds everything).
3. `npm run dev` to preview locally.
4. `git add originals public && git commit && git push`

**Always commit `public/` along with `originals/`.** CI never downloads LFS
files, so it cannot regenerate the web copies.

## Publishing to GitHub (first time)

```bash
gh repo create ireland-trip-2026 --public --source . --push
# or: git remote add origin https://github.com/<you>/ireland-trip-2026.git && git push -u origin main
```

Then **Settings → Pages → Source: GitHub Actions**. The first push uploads
the LFS originals, which takes a while because they are several GB.

## Limits to keep in mind

- **Git LFS quota is per account** and all repos share it. This repo's
  originals are several GB, so check Settings → Billing → Git LFS before
  pushing. "Original from camera" downloads by viewers also use LFS bandwidth.
- Private repo: Pages for private repos needs a paid plan, and "Original"
  links are hidden because `media.githubusercontent.com` needs auth.
- Plain-git files over 100MB are rejected by GitHub. Web copies stay far
  below that, and the script warns above 50MB.
