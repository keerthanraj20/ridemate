import { useEffect, useState } from 'react'
import { ShieldAlert, Check } from 'lucide-react'
import { api } from '../api.js'
import { useToast } from '../Toast.jsx'
import { timeAgo } from '../utils.js'

const STATUS_LABEL = { open: 'Open', reviewed: 'Reviewed', actioned: 'Actioned', dismissed: 'Dismissed' }

export default function Admin() {
  const toast = useToast()
  const [reports, setReports] = useState(null)

  async function load() {
    try {
      const res = await api('/admin/reports')
      setReports(res.reports)
    } catch (err) {
      toast(err.message, 'bad')
      setReports([])
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function act(id, action, status) {
    try {
      await api(`/admin/reports/${id}/action`, { method: 'POST', body: { action, status } })
      toast('Updated')
      load()
    } catch (err) {
      toast(err.message, 'bad')
    }
  }

  function setStatus(id, status) {
    act(id, undefined, status)
  }

  return (
    <div className="page fade-in">
      <div className="page-head">
        <h2>Moderation <span className="grad-text"><ShieldAlert size={24} /></span></h2>
      </div>

      {reports === null ? (
        <div className="skel-card card"><div className="skel-line w50" /></div>
      ) : reports.length === 0 ? (
        <div className="card empty"><p><b>No reports to review.</b></p></div>
      ) : (
        <div className="stack">
          {reports.map((r) => (
            <div key={r.id} className="card">
              <div className="row spread">
                <b>{r.reported_name}</b>
                <span className={`chip trust trust-${r.status === 'open' ? 'bad' : 'ok'}`}>{STATUS_LABEL[r.status]}</span>
              </div>
              <p style={{ margin: '6px 0' }}>
                <b>{r.reason}</b>
                {r.details && <span className="hint"> — {r.details}</span>}
              </p>
              <span className="hint">
                Reported by {r.reporter_name} · {timeAgo(r.created_at)}
              </span>
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn danger sm" onClick={() => act(r.id, 'suspend')}>Suspend</button>
                <button className="btn ghost sm" onClick={() => act(r.id, 'unsuspend')}>Unsuspend</button>
                <span className="grow" />
                <button className="btn ghost sm" onClick={() => setStatus(r.id, 'reviewed')}><Check size={14} /> Reviewed</button>
                <button className="btn ghost sm" onClick={() => setStatus(r.id, 'dismissed')}>Dismiss</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
