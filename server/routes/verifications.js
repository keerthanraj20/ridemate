import { Router } from 'express'
import { all, get, run } from '../db.js'
import { auth, requireAdmin } from './auth.js'
import { notify } from '../notify.js'

const router = Router()

// Same raster-only policy as avatars: no SVG (XSS vector via data-URI script).
const ALLOWED_DOC_MIMES = new Set([
  'data:image/png;base64,',
  'data:image/jpeg;base64,',
  'data:image/jpg;base64,',
  'data:image/webp;base64,',
])
const DOC_TYPES = ['aadhaar', 'driving_license', 'pan', 'voter']

// ---------- my verifications ----------
router.get('/verifications', auth, async (req, res) => {
  const list = await all('SELECT id, doc_type, status, admin_note, created_at, reviewed_at FROM id_verifications WHERE user_id=? ORDER BY id DESC', [req.user.id])
  const user = await get('SELECT id_verified FROM users WHERE id=?', [req.user.id])
  res.json({ verified: Boolean(user.id_verified), verifications: list })
})

// ---------- submit an ID doc for review ----------
router.post('/verifications', auth, async (req, res) => {
  const docType = String(req.body?.doc_type || '').trim()
  if (!DOC_TYPES.includes(docType)) return res.status(400).json({ error: 'Choose a document type' })

  const doc = String(req.body?.doc_image || '').trim()
  if (!doc) return res.status(400).json({ error: 'Upload a photo of your document' })
  const prefix = doc.slice(0, doc.indexOf(',') + 1)
  if (!ALLOWED_DOC_MIMES.has(prefix)) return res.status(400).json({ error: 'Upload a PNG, JPEG or WebP image' })
  if (doc.length > 1_400_000) return res.status(400).json({ error: 'Image must be under 1 MB' })

  const pending = await get("SELECT id FROM id_verifications WHERE user_id=? AND status='pending'", [req.user.id])
  if (pending) return res.status(400).json({ error: 'You already have a pending verification' })

  const already = await get("SELECT id FROM id_verifications WHERE user_id=? AND doc_type=? AND status='approved'", [req.user.id, docType])
  if (already) return res.status(400).json({ error: 'This document is already approved' })

  const info = await run('INSERT INTO id_verifications (user_id, doc_type, doc_image) VALUES (?,?,?)', [req.user.id, docType, doc])

  const admins = await all('SELECT id FROM users WHERE is_admin=1')
  for (const a of admins) {
    await notify(a.id, {
      type: 'verify',
      title: 'ID verification pending review',
      body: `A user submitted ${docType.replace('_', ' ')} for approval.`,
      link: '/admin',
    })
  }

  res.status(201).json({
    message: 'Document submitted — our team usually approves within 24h',
    verification: await get('SELECT id, doc_type, status, created_at FROM id_verifications WHERE id=?', [Number(info.lastInsertRowid)]),
  })
})

// ---------- admin: pending queue ----------
router.get('/admin/verifications', auth, requireAdmin, async (req, res) => {
  const rows = await all(
    `SELECT v.*, u.name AS user_name, u.email AS user_email FROM id_verifications v
     JOIN users u ON u.id=v.user_id
     ORDER BY CASE v.status WHEN 'pending' THEN 0 ELSE 1 END, v.created_at ASC
     LIMIT 100`
  )
  res.json({ verifications: rows })
})

// ---------- admin: approve / reject ----------
router.post('/admin/verifications/:id/action', auth, requireAdmin, async (req, res) => {
  const v = await get('SELECT * FROM id_verifications WHERE id=?', [Number(req.params.id)])
  if (!v) return res.status(404).json({ error: 'Verification not found' })
  if (v.status !== 'pending') return res.status(400).json({ error: 'Already reviewed' })

  const action = req.body?.action // 'approve' | 'reject'
  const note = String(req.body?.note || '').trim().slice(0, 300) || null
  if (action !== 'approve' && action !== 'reject') return res.status(400).json({ error: 'Provide approve or reject' })

  await run("UPDATE id_verifications SET status=?, admin_note=?, reviewed_at=datetime('now') WHERE id=?", [
    action === 'approve' ? 'approved' : 'rejected', note, v.id,
  ])
  if (action === 'approve') {
    await run('UPDATE users SET id_verified=1 WHERE id=?', [v.user_id])
  }

  await notify(v.user_id, {
    type: 'verify',
    title: action === 'approve' ? 'ID verified ✅' : 'ID verification rejected',
    body: action === 'approve'
      ? 'Your government ID was approved — you are now a fully verified SaathYaan member.'
      : note ? `Your ID was rejected: ${note}` : 'Your ID was rejected. Please resubmit a clear photo.',
    link: '/profile',
  })

  res.json({ ok: true })
})

export default router