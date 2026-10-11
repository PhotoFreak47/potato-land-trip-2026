import { useEffect, useMemo, useState } from 'react'
import {
  AppBar,
  Toolbar,
  Typography,
  Container,
  ImageList,
  ImageListItem,
  ImageListItemBar,
  IconButton,
  Dialog,
  DialogContent,
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

// manifest.json is generated locally by scripts/generate-manifest.js from originals/
// Shape: { tripName, generatedAt, days, counts, items: [{ type, id, day, file, original, thumb, src, width, height, duration?, tags }] }
const BASE = import.meta.env.BASE_URL
const MANIFEST_URL = `${BASE}manifest.json`
// Set by CI to https://media.githubusercontent.com/media/<owner>/<repo>/<branch>/
// so "Original" links resolve the LFS file. Unset locally / for private repos.
const ORIGINALS_BASE = import.meta.env.VITE_ORIGINALS_BASE || ''

const fmtDay = (day) => {
  const d = new Date(`${day}T12:00:00`)
  return isNaN(d) ? day : d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
const fmtDuration = (s) => (s == null ? '' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)
const fmtMB = (kb) => `${(kb / 1024).toFixed(kb < 10240 ? 1 : 0)} MB`

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

// Web copy is always available on Pages. The camera original lives in Git LFS
// and is only offered when CI tells us where to find it (public repos).
function DownloadMenu({ anchorEl, onClose, item }) {
  if (!item) return null
  const webLabel = item.type === 'video' ? 'Web video (1080p)' : `Web size (${Math.max(item.width, item.height)}px)`
  return (
    <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={onClose}>
      <MenuItem component="a" href={`${BASE}${item.src}`} download={item.src.split('/').pop()} onClick={onClose}>
        <ListItemIcon><ImageIcon fontSize="small" /></ListItemIcon>
        <ListItemText primary={webLabel} secondary={fmtMB(item.sizeKB)} />
      </MenuItem>
      {ORIGINALS_BASE && (
        <MenuItem component="a" href={`${ORIGINALS_BASE}${item.original}`} target="_blank" rel="noopener" onClick={onClose}>
          <ListItemIcon><HighQualityIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Original from camera" secondary={fmtMB(item.originalSizeKB)} />
        </MenuItem>
      )}
    </Menu>
  )
}

function Tile({ item, onOpen, onDownload, onShare }) {
  return (
    <ImageListItem onClick={() => onOpen(item)} sx={{ cursor: item.type === 'video' ? 'pointer' : 'zoom-in' }}>
      <img src={`${BASE}${item.thumb}`} alt={item.file} loading="lazy" style={{ borderRadius: 8 }} />
      {item.type === 'video' && (
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <PlayCircleIcon sx={{ fontSize: 64, color: 'white', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.6))' }} />
        </Box>
      )}
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

  const openMenu = (kind) => (e, item) => {
    e.stopPropagation()
    setMenu({ kind, anchor: e.currentTarget, item })
  }
  const closeMenu = () => setMenu((m) => ({ ...m, anchor: null }))

  const current = lightbox != null ? items[lightbox] : null
  const cols = isSmall ? 2 : isMedium ? 3 : 4
  const navSx = { position: 'absolute', top: '50%', transform: 'translateY(-50%)', color: 'white', bgcolor: 'rgba(0,0,0,0.4)', zIndex: 1 }

  return (
    <>
      <AppBar position="sticky" color="transparent" elevation={0} sx={{ backdropFilter: 'blur(8px)' }}>
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
        </Toolbar>
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

            {byDay.map(([day, entries]) => (
              <Box key={day} component="section" sx={{ mb: 4 }}>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  {fmtDay(day)}{' '}
                  <Typography component="span" variant="body2" color="text.secondary">
                    · {entries.length} item{entries.length === 1 ? '' : 's'}
                  </Typography>
                </Typography>
                <ImageList variant="masonry" cols={cols} gap={10}>
                  {entries.map(({ item, index }) => (
                    <Tile
                      key={item.id}
                      item={item}
                      onOpen={() => setLightbox(index)}
                      onDownload={openMenu('download')}
                      onShare={openMenu('share')}
                    />
                  ))}
                </ImageList>
              </Box>
            ))}
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
      <DownloadMenu anchorEl={menu.kind === 'download' ? menu.anchor : null} item={menu.item} onClose={closeMenu} />
    </>
  )
}
