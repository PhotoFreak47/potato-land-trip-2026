import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AppBar,
  Toolbar,
  Typography,
  Container,
  ImageList,
  ImageListItem,
  ImageListItemBar,
  IconButton,
  Button,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Radio,
  RadioGroup,
  Snackbar,
  Paper,
  LinearProgress,
  Box,
  Chip,
  Stack,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  TextField,
  InputAdornment,
  useMediaQuery,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import DownloadIcon from '@mui/icons-material/Download'
import ShareIcon from '@mui/icons-material/Share'
import CloseIcon from '@mui/icons-material/Close'
import SearchIcon from '@mui/icons-material/Search'
import FacebookIcon from '@mui/icons-material/Facebook'
import XIcon from '@mui/icons-material/Twitter'
import WhatsAppIcon from '@mui/icons-material/WhatsApp'
import LinkIcon from '@mui/icons-material/Link'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import PlayCircleIcon from '@mui/icons-material/PlayCircleOutline'
import ImageIcon from '@mui/icons-material/Image'
import HighQualityIcon from '@mui/icons-material/HighQuality'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import { ORIGINALS_BASE, PART_LIMIT_KB, planParts, saveItems, totalKB } from './download.js'

// manifest.json is generated locally by scripts/generate-manifest.js from originals/
// Shape: { tripName, generatedAt, days, counts, items: [{ type, id, day, file, original, thumb, src, width, height, duration?, tags }] }
const BASE = import.meta.env.BASE_URL
const MANIFEST_URL = `${BASE}manifest.json`
const LONG_PRESS_MS = 450
const QUALITY_KEY = 'downloadQuality'

const fmtDay = (day) => {
  const d = new Date(`${day}T12:00:00`)
  return isNaN(d) ? day : d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
const fmtDuration = (s) => (s == null ? '' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)
const fmtSize = (kb) =>
  kb >= 1024 * 1024 ? `${(kb / 1024 / 1024).toFixed(1)} GB` : `${(kb / 1024).toFixed(kb < 10240 ? 1 : 0)} MB`
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// "12 photos", "1 video", "297 photos and 9 videos"
function describe(items) {
  const videos = items.filter((i) => i.type === 'video').length
  const photos = items.length - videos
  return [photos && plural(photos, 'photo'), videos && plural(videos, 'video')].filter(Boolean).join(' and ')
}

// The last SQ/HD choice is remembered per browser; SQ until then.
const loadQuality = () => {
  try {
    return localStorage.getItem(QUALITY_KEY) === 'hd' && ORIGINALS_BASE ? 'hd' : 'sq'
  } catch {
    return 'sq'
  }
}
const saveQuality = (quality) => {
  try {
    localStorage.setItem(QUALITY_KEY, quality)
  } catch {
    /* storage blocked */
  }
}

function shareUrls(pageUrl, title) {
  const u = encodeURIComponent(pageUrl)
  const t = encodeURIComponent(title)
  return {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    x: `https://twitter.com/intent/tweet?url=${u}&text=${t}`,
    whatsapp: `https://wa.me/?text=${t}%20${u}`,
  }
}

function ShareMenu({ anchorEl, onClose, item }) {
  if (!item) return null
  const itemUrl = `${window.location.origin}${BASE}${item.src}`
  const links = shareUrls(itemUrl, `${item.type === 'video' ? 'Video' : 'Photo'} from ${document.title}`)

  const nativeShare = async () => {
    onClose()
    try {
      await navigator.share({ title: item.file, url: itemUrl })
    } catch {
      /* user cancelled */
    }
  }

  const copyLink = async () => {
    onClose()
    await navigator.clipboard.writeText(itemUrl)
  }

  return (
    <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={onClose}>
      {typeof navigator !== 'undefined' && navigator.share && (
        <MenuItem onClick={nativeShare}>
          <ListItemIcon><ShareIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Share via device...</ListItemText>
        </MenuItem>
      )}
      <MenuItem component="a" href={links.whatsapp} target="_blank" rel="noopener" onClick={onClose}>
        <ListItemIcon><WhatsAppIcon fontSize="small" /></ListItemIcon>
        <ListItemText>WhatsApp</ListItemText>
      </MenuItem>
      <MenuItem component="a" href={links.x} target="_blank" rel="noopener" onClick={onClose}>
        <ListItemIcon><XIcon fontSize="small" /></ListItemIcon>
        <ListItemText>X</ListItemText>
      </MenuItem>
      <MenuItem component="a" href={links.facebook} target="_blank" rel="noopener" onClick={onClose}>
        <ListItemIcon><FacebookIcon fontSize="small" /></ListItemIcon>
        <ListItemText>Facebook</ListItemText>
      </MenuItem>
      <MenuItem onClick={copyLink}>
        <ListItemIcon><LinkIcon fontSize="small" /></ListItemIcon>
        <ListItemText>Copy link</ListItemText>
      </MenuItem>
    </Menu>
  )
}

// SQ is the web copy on Pages and is always available. HD is the camera
// original in Git LFS and is only offered when CI tells us where to find it.
function DownloadMenu({ anchorEl, onClose, item, onHD, busy }) {
  if (!item) return null
  const sqLabel = item.type === 'video' ? '1080p video' : `${Math.max(item.width, item.height)}px`
  return (
    <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={onClose}>
      <MenuItem component="a" href={`${BASE}${item.src}`} download={item.src.split('/').pop()} onClick={onClose}>
        <ListItemIcon><ImageIcon fontSize="small" /></ListItemIcon>
        <ListItemText primary="SQ · Standard quality" secondary={`${sqLabel} · ${fmtSize(item.sizeKB)}`} />
      </MenuItem>
      {ORIGINALS_BASE && (
        <MenuItem disabled={busy} onClick={() => { onClose(); onHD(item) }}>
          <ListItemIcon><HighQualityIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="HD · Full resolution" secondary={`Original from camera · ${fmtSize(item.originalSizeKB)}`} />
        </MenuItem>
      )}
    </Menu>
  )
}

function QualityOption({ value, title, detail, size, disabled, checked }) {
  return (
    <Box
      component="label"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        p: 1.5,
        pl: 0.5,
        border: 1,
        borderRadius: 2,
        borderColor: checked ? 'primary.main' : 'divider',
        bgcolor: (t) => (checked ? alpha(t.palette.primary.main, 0.08) : 'transparent'),
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'border-color .15s, background-color .15s',
      }}
    >
      <Radio value={value} disabled={disabled} />
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography fontWeight={600}>{title}</Typography>
        <Typography variant="body2" color="text.secondary">{detail}</Typography>
      </Box>
      <Typography variant="body2" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{size}</Typography>
    </Box>
  )
}

// Picks SQ or HD for a multi-item download, showing the size of each.
function DownloadDialog({ items, onClose, onDownload }) {
  const [quality, setQuality] = useState(loadQuality)
  const last = useRef([])
  if (items) last.current = items // keep the content while the dialog animates closed
  const list = last.current

  const hasPhotos = list.some((i) => i.type === 'photo')
  const hasVideos = list.some((i) => i.type === 'video')
  const sqDetail = [hasPhotos && '2560px photos', hasVideos && '1080p video'].filter(Boolean).join(', ')
  const parts = planParts(list, quality).length
  const multiDay = new Set(list.map((i) => i.day)).size > 1

  let note = ''
  if (list.length > 1) {
    note = parts > 1
      ? `Saved as ${parts} ZIP files of up to ${PART_LIMIT_KB / 1024} MB each.`
      : `Saved as one ZIP file${multiDay ? ', with a folder per day' : ''}.`
  }
  if (totalKB(list, quality) > 1024 * 1024) note += ' Large download, best on Wi-Fi.'

  return (
    <Dialog open={Boolean(items)} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Download {describe(list)}</DialogTitle>
      <DialogContent>
        <RadioGroup value={quality} onChange={(e) => setQuality(e.target.value)} sx={{ gap: 1 }}>
          <QualityOption
            value="sq"
            checked={quality === 'sq'}
            title="SQ · Standard quality"
            detail={`${sqDetail}. Quick, great for phones and sharing.`}
            size={fmtSize(totalKB(list, 'sq'))}
          />
          <QualityOption
            value="hd"
            checked={quality === 'hd'}
            title="HD · Full resolution"
            detail={ORIGINALS_BASE ? 'Original files from the camera.' : 'Not available for this gallery.'}
            size={fmtSize(totalKB(list, 'hd'))}
            disabled={!ORIGINALS_BASE}
          />
        </RadioGroup>
        {note && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            {note.trim()}
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" startIcon={<DownloadIcon />} onClick={() => onDownload(list, quality)}>
          Download
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function DownloadProgress({ job, onCancel, onRetry, onDismiss }) {
  const last = useRef(null)
  if (job) last.current = job // keep the content while the snackbar animates out
  const shown = last.current
  if (!shown) return null

  const { items, quality, status, progress, error } = shown
  const single = items.length === 1
  const what = single ? items[0].file : describe(items)
  const pct = progress?.totalBytes ? (100 * progress.bytes) / progress.totalBytes : 0

  let title = `Downloading ${what} (${quality.toUpperCase()})`
  if (status === 'running' && progress?.parts > 1) title += ` · part ${progress.part} of ${progress.parts}`
  if (status === 'done') title = `Downloaded ${what}`
  if (status === 'error') title = 'Download failed'

  let detail = ''
  if (status === 'running' && progress) {
    detail = `${fmtSize(progress.bytes / 1024)} of ${fmtSize(progress.totalBytes / 1024)}`
    if (!single) detail += ` · ${progress.files} of ${progress.totalFiles} files`
  }
  if (status === 'done') detail = progress?.parts > 1 ? `Saved as ${progress.parts} ZIP files.` : 'Saved to your device.'
  if (status === 'error') detail = error

  return (
    <Snackbar
      open={Boolean(job)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      autoHideDuration={status === 'done' ? 5000 : null}
      onClose={(e, reason) => reason === 'timeout' && onDismiss()}
    >
      <Paper elevation={8} sx={{ p: 2, width: 380, maxWidth: 'calc(100vw - 32px)' }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          {status === 'running' && <CircularProgress size={20} />}
          {status === 'done' && <CheckCircleIcon color="success" />}
          {status === 'error' && <ErrorOutlineIcon color="error" />}
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={600}>{title}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {detail}
            </Typography>
          </Box>
          {status === 'running' && <Button size="small" onClick={onCancel}>Cancel</Button>}
          {status === 'error' && <Button size="small" onClick={onRetry}>Retry</Button>}
          {status !== 'running' && (
            <IconButton size="small" aria-label="Dismiss" onClick={onDismiss}>
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
        </Stack>
        {status === 'running' && (
          <LinearProgress variant={progress ? 'determinate' : 'indeterminate'} value={pct} sx={{ mt: 1.5, borderRadius: 1 }} />
        )}
      </Paper>
    </Snackbar>
  )
}

// Text button on wide screens, icon button with a tooltip on phones.
function BarButton({ icon, label, compact, ...props }) {
  return compact ? (
    <Tooltip title={label}>
      <span>
        <IconButton aria-label={label} {...props}>{icon}</IconButton>
      </span>
    </Tooltip>
  ) : (
    <Button startIcon={icon} {...props}>{label}</Button>
  )
}

// Desktop: the checkbox appears on hover. Touch: long-press selects, since
// there is no hover. Once anything is selected, a tap toggles instead of opening.
function Tile({ item, selecting, selected, onOpen, onToggle, onDownload, onShare }) {
  const press = useRef(null)

  const onPointerDown = (e) => {
    press.current = null
    if (e.pointerType !== 'touch') return
    const p = { x: e.clientX, y: e.clientY, fired: false }
    p.timer = setTimeout(() => {
      p.fired = true
      navigator.vibrate?.(10)
      onToggle(false)
    }, LONG_PRESS_MS)
    press.current = p
  }
  const onPointerMove = (e) => {
    const p = press.current
    if (p && !p.fired && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) clearTimeout(p.timer)
  }
  const endPress = () => press.current && clearTimeout(press.current.timer)

  const onClick = (e) => {
    if (press.current?.fired) return // the long-press already selected it
    if (selecting) onToggle(e.shiftKey)
    else onOpen(item)
  }

  return (
    <ImageListItem
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPress}
      onPointerCancel={endPress}
      onContextMenu={(e) => press.current && e.preventDefault()}
      sx={{
        cursor: selecting || item.type === 'video' ? 'pointer' : 'zoom-in',
        userSelect: 'none',
        WebkitTouchCallout: 'none',
        borderRadius: '8px',
        bgcolor: (t) => (selected ? alpha(t.palette.primary.main, 0.18) : 'transparent'),
        transition: 'background-color .15s',
        '& .tile-check': { opacity: selecting ? 1 : 0, pointerEvents: selecting ? 'auto' : 'none' },
        '@media (hover: hover)': { '&:hover .tile-check': { opacity: 1, pointerEvents: 'auto' } },
        '& .tile-check:focus-visible': { opacity: 1 },
      }}
    >
      <img
        src={`${BASE}${item.thumb}`}
        alt={item.file}
        loading="lazy"
        draggable={false}
        style={{ borderRadius: 8, transform: selected ? 'scale(0.88)' : 'none', transition: 'transform .15s' }}
      />
      {item.type === 'video' && (
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <PlayCircleIcon sx={{ fontSize: 64, color: 'white', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.6))' }} />
        </Box>
      )}
      <IconButton
        className="tile-check"
        aria-label={`${selected ? 'Deselect' : 'Select'} ${item.file}`}
        aria-pressed={selected}
        onClick={(e) => {
          e.stopPropagation()
          onToggle(e.shiftKey)
        }}
        sx={{ position: 'absolute', top: 2, left: 2, color: 'white', transition: 'opacity .15s', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,.7))' }}
      >
        {selected ? (
          <CheckCircleIcon sx={{ color: 'primary.main', bgcolor: 'white', borderRadius: '50%' }} />
        ) : (
          <RadioButtonUncheckedIcon sx={{ bgcolor: 'rgba(0,0,0,0.3)', borderRadius: '50%' }} />
        )}
      </IconButton>
      {!selecting && (
        <ImageListItemBar
          sx={{ borderRadius: '0 0 8px 8px' }}
          title={item.type === 'video' ? fmtDuration(item.duration) : ''}
          actionIcon={
            <>
              <IconButton sx={{ color: 'white' }} onClick={(e) => onDownload(e, item)} aria-label="download">
                <DownloadIcon />
              </IconButton>
              <IconButton sx={{ color: 'white' }} onClick={(e) => onShare(e, item)} aria-label="share">
                <ShareIcon />
              </IconButton>
            </>
          }
        />
      )}
    </ImageListItem>
  )
}

export default function App() {
  const [manifest, setManifest] = useState(null)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all') // all | photo | video
  const [lightbox, setLightbox] = useState(null) // index into `items` or null
  const [menu, setMenu] = useState({ kind: null, anchor: null, item: null })
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(() => new Set()) // item ids
  const lastToggled = useRef(null) // index into `items`, for shift-click ranges
  const [dialogItems, setDialogItems] = useState(null) // items the SQ/HD dialog is for
  const [job, setJob] = useState(null) // the running/finished download
  const isSmall = useMediaQuery('(max-width:600px)')
  const isMedium = useMediaQuery('(max-width:1000px)')

  useEffect(() => {
    fetch(MANIFEST_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`manifest.json not found (${r.status})`)
        return r.json()
      })
      .then((m) => {
        setManifest(m)
        document.title = m.tripName
      })
      .catch((e) => setError(e.message))
  }, [])

  const items = useMemo(() => {
    if (!manifest) return []
    const q = query.trim().toLowerCase()
    return manifest.items.filter(
      (i) =>
        (filter === 'all' || i.type === filter) &&
        (!q ||
          i.file.toLowerCase().includes(q) ||
          i.day.includes(q) ||
          (i.tags || []).some((t) => t.toLowerCase().includes(q))),
    )
  }, [manifest, query, filter])

  const byDay = useMemo(() => {
    const groups = new Map()
    items.forEach((item, index) => {
      if (!groups.has(item.day)) groups.set(item.day, [])
      groups.get(item.day).push({ item, index })
    })
    return [...groups.entries()]
  }, [items])

  // Selection survives filtering; what's selected is downloaded in gallery order.
  const selectedItems = useMemo(() => (manifest ? manifest.items.filter((i) => selected.has(i.id)) : []), [manifest, selected])
  const allShownSelected = items.length > 0 && items.every((i) => selected.has(i.id))
  useEffect(() => {
    lastToggled.current = null
  }, [items])

  // Arrow-key navigation inside the lightbox.
  useEffect(() => {
    if (lightbox == null) return
    const onKey = (e) => {
      if (e.key === 'ArrowRight') setLightbox((i) => Math.min(items.length - 1, i + 1))
      if (e.key === 'ArrowLeft') setLightbox((i) => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, items.length])

  const exitSelect = () => {
    setSelectMode(false)
    setSelected(new Set())
    lastToggled.current = null
  }

  // Esc leaves selection mode (dialogs handle their own Esc).
  useEffect(() => {
    if (!selectMode || dialogItems) return
    const onKey = (e) => e.key === 'Escape' && exitSelect()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectMode, dialogItems])

  // Shift-click selects everything between the last toggled tile and this one.
  const toggle = (index, range) => {
    const from = lastToggled.current
    setSelected((prev) => {
      const next = new Set(prev)
      if (range && from != null) {
        items.slice(Math.min(from, index), Math.max(from, index) + 1).forEach((i) => next.add(i.id))
      } else if (next.has(items[index].id)) {
        next.delete(items[index].id)
      } else {
        next.add(items[index].id)
      }
      return next
    })
    lastToggled.current = index
    setSelectMode(true)
  }

  const setMany = (list, on) => {
    setSelected((prev) => {
      const next = new Set(prev)
      list.forEach((i) => (on ? next.add(i.id) : next.delete(i.id)))
      return next
    })
    setSelectMode(true)
  }

  // Runs straight from the click so the browser allows the save dialog.
  const startDownload = (list, quality) => {
    const label = quality.toUpperCase()
    const name = list.length === manifest.items.length
      ? `${manifest.tripName} (${label})`
      : `${manifest.tripName} - ${describe(list)} (${label})`
    const controller = new AbortController()
    const update = (patch) => setJob((j) => (j?.controller === controller ? { ...j, ...patch } : j))
    setJob({ items: list, quality, controller, status: 'running', progress: null })
    saveItems({ items: list, quality, name, signal: controller.signal, onProgress: (progress) => update({ progress }) })
      .then(() => update({ status: 'done' }))
      .catch((e) => {
        if (controller.signal.aborted || e.name === 'AbortError') setJob((j) => (j?.controller === controller ? null : j))
        else update({ status: 'error', error: e.message })
      })
  }

  const openMenu = (kind) => (e, item) => {
    e.stopPropagation()
    setMenu({ kind, anchor: e.currentTarget, item })
  }
  const closeMenu = () => setMenu((m) => ({ ...m, anchor: null }))

  const busy = job?.status === 'running'
  const current = lightbox != null ? items[lightbox] : null
  const cols = isSmall ? 2 : isMedium ? 3 : 4
  const navSx = { position: 'absolute', top: '50%', transform: 'translateY(-50%)', color: 'white', bgcolor: 'rgba(0,0,0,0.4)', zIndex: 1 }

  return (
    <>
      <AppBar
        position="sticky"
        color="transparent"
        elevation={0}
        sx={{ backdropFilter: 'blur(8px)', bgcolor: (t) => (selectMode ? alpha(t.palette.primary.main, 0.14) : 'transparent') }}
      >
        {selectMode ? (
          <Toolbar sx={{ gap: 1, py: 1 }}>
            <IconButton edge="start" aria-label="Cancel selection" onClick={exitSelect}>
              <CloseIcon />
            </IconButton>
            <Typography variant={isSmall ? 'subtitle1' : 'h6'} sx={{ flexGrow: 1 }} noWrap>
              {selected.size ? `${selected.size} selected` : 'Select items'}
            </Typography>
            <Button onClick={() => setMany(items, !allShownSelected)} disabled={!items.length}>
              {allShownSelected ? 'Deselect all' : 'Select all'}
            </Button>
            <Button variant="contained" startIcon={<DownloadIcon />} disabled={!selected.size || busy} onClick={() => setDialogItems(selectedItems)}>
              Download
            </Button>
          </Toolbar>
        ) : (
          <Toolbar sx={{ gap: 1, flexWrap: 'wrap', py: 1 }}>
            <PhotoCameraIcon sx={{ mr: 0.5 }} />
            <Typography variant="h6" sx={{ flexGrow: 1 }}>
              {manifest?.tripName || 'Trip Photos'}
            </Typography>
            <TextField
              size="small"
              placeholder="Search file, date or tag..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
            {manifest && (
              <Stack direction="row" spacing={0.5}>
                <BarButton icon={<CheckCircleOutlineIcon />} label="Select" compact={isSmall} onClick={() => setSelectMode(true)} />
                <BarButton
                  icon={<DownloadIcon />}
                  label="Download all"
                  compact={isSmall}
                  disabled={busy || !items.length}
                  onClick={() => setDialogItems(items)}
                />
              </Stack>
            )}
          </Toolbar>
        )}
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 3 }}>
        {error && (
          <Typography color="error" sx={{ mb: 2 }}>
            Couldn't load manifest.json — run <code>npm run manifest</code> after adding
            day folders to originals/. ({error})
          </Typography>
        )}

        {!manifest && !error && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        )}

        {manifest && (
          <>
            <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
              <Chip label={`All (${manifest.items.length})`} size="small" color={filter === 'all' ? 'primary' : 'default'} onClick={() => setFilter('all')} />
              <Chip label={`Photos (${manifest.counts.photos})`} size="small" color={filter === 'photo' ? 'primary' : 'default'} onClick={() => setFilter('photo')} />
              {manifest.counts.videos > 0 && (
                <Chip label={`Videos (${manifest.counts.videos})`} size="small" color={filter === 'video' ? 'primary' : 'default'} onClick={() => setFilter('video')} />
              )}
              <Chip label={`Updated ${new Date(manifest.generatedAt).toLocaleDateString()}`} size="small" variant="outlined" />
            </Stack>

            {byDay.map(([day, entries]) => {
              const daySelected = entries.every(({ item }) => selected.has(item.id))
              return (
                <Box key={day} component="section" sx={{ mb: 4 }}>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      columnGap: 1,
                      mb: 1,
                      '& .day-check': { opacity: selectMode ? 1 : 0, pointerEvents: selectMode ? 'auto' : 'none', transition: 'opacity .15s' },
                      '@media (hover: hover)': { '&:hover .day-check': { opacity: 1, pointerEvents: 'auto' } },
                      '& .day-check:focus-visible': { opacity: 1 },
                    }}
                  >
                    <Typography variant="h6">
                      {fmtDay(day)}{' '}
                      <Typography component="span" variant="body2" color="text.secondary">
                        · {entries.length} item{entries.length === 1 ? '' : 's'}
                      </Typography>
                    </Typography>
                    <Button
                      className="day-check"
                      size="small"
                      startIcon={daySelected ? <CheckCircleIcon /> : <RadioButtonUncheckedIcon />}
                      onClick={() => setMany(entries.map(({ item }) => item), !daySelected)}
                    >
                      {daySelected ? 'Deselect day' : 'Select day'}
                    </Button>
                  </Box>
                  <ImageList variant="masonry" cols={cols} gap={10}>
                    {entries.map(({ item, index }) => (
                      <Tile
                        key={item.id}
                        item={item}
                        selecting={selectMode}
                        selected={selected.has(item.id)}
                        onOpen={() => setLightbox(index)}
                        onToggle={(range) => toggle(index, range)}
                        onDownload={openMenu('download')}
                        onShare={openMenu('share')}
                      />
                    ))}
                  </ImageList>
                </Box>
              )
            })}
          </>
        )}
      </Container>

      <Dialog open={Boolean(current)} onClose={() => setLightbox(null)} maxWidth="xl">
        <DialogContent sx={{ p: 0, position: 'relative', bgcolor: 'black' }}>
          <IconButton
            onClick={() => setLightbox(null)}
            sx={{ position: 'absolute', top: 8, right: 8, color: 'white', bgcolor: 'rgba(0,0,0,0.4)', zIndex: 1 }}
          >
            <CloseIcon />
          </IconButton>
          {lightbox > 0 && (
            <IconButton onClick={() => setLightbox(lightbox - 1)} sx={{ ...navSx, left: 8 }} aria-label="previous">
              <ChevronLeftIcon />
            </IconButton>
          )}
          {lightbox != null && lightbox < items.length - 1 && (
            <IconButton onClick={() => setLightbox(lightbox + 1)} sx={{ ...navSx, right: 8 }} aria-label="next">
              <ChevronRightIcon />
            </IconButton>
          )}
          {current?.type === 'photo' && (
            <img
              src={`${BASE}${current.src}`}
              alt={current.file}
              style={{ display: 'block', maxWidth: '90vw', maxHeight: '85vh' }}
            />
          )}
          {current?.type === 'video' && (
            <video
              key={current.id}
              src={`${BASE}${current.src}`}
              poster={`${BASE}${current.thumb}`}
              controls
              autoPlay
              playsInline
              preload="metadata"
              style={{ display: 'block', maxWidth: '90vw', maxHeight: '85vh' }}
            />
          )}
        </DialogContent>
      </Dialog>

      <ShareMenu anchorEl={menu.kind === 'share' ? menu.anchor : null} item={menu.item} onClose={closeMenu} />
      <DownloadMenu
        anchorEl={menu.kind === 'download' ? menu.anchor : null}
        item={menu.item}
        onClose={closeMenu}
        busy={busy}
        onHD={(item) => startDownload([item], 'hd')}
      />
      <DownloadDialog
        items={dialogItems}
        onClose={() => setDialogItems(null)}
        onDownload={(list, quality) => {
          saveQuality(quality)
          setDialogItems(null)
          exitSelect()
          startDownload(list, quality)
        }}
      />
      <DownloadProgress
        job={job}
        onCancel={() => job?.controller.abort()}
        onRetry={() => job && startDownload(job.items, job.quality)}
        onDismiss={() => setJob(null)}
      />
    </>
  )
}
