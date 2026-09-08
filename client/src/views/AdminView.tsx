import { useState, useEffect, useCallback } from "react"
import { ShieldCheck, AlertTriangle, FileCheck2, Download, Users, Car, CheckCircle2, XCircle, RefreshCw } from "lucide-react"
import { api } from "../api.js"
import { useAuth } from "../AuthContext.jsx"
import { useToast } from "../Toast.jsx"
import { Badge, AvatarCircle } from "../components/ui.tsx"
import { initials, hashColor, relativeTime } from "../lib.ts"

type Tab = "stats" | "sos" | "verify"

export function AdminView() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>("stats")
  const [stats, setStats] = useState<any | null>(null)
  const [sos, setSos] = useState<any[]>([])
  const [verifications, setVerifications] = useState<any[]>([])
  const toast = useToast()

  const loadStats = useCallback(async () => {
    try { setStats((await api("/admin/stats")).stats) } catch { /* ignore */ }
  }, [])

  const loadSos = useCallback(async () => {
    try { setSos((await api("/admin/sos")).alerts || []) } catch { /* ignore */ }
  }, [])

  const loadVerify = useCallback(async () => {
    try { setVerifications((await api("/admin/verifications")).verifications || []) } catch { /* ignore */ }
  }, [])

  const reload = useCallback(() => {
    void loadStats(); void loadSos(); void loadVerify()
  }, [loadStats, loadSos, loadVerify])

  useEffect(() => { reload() }, [reload])

  if (!user?.is_admin) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="text-5xl mb-3">🔒</div>
        <div className="font-display font-700 text-ink text-lg mb-1">Admins only</div>
        <p className="text-ink-3 text-sm">This console is restricted to platform moderators.</p>
      </div>
    )
  }

  const closeSos = async (id: number) => {
    try { await api(`/admin/sos/${id}/close`, { method: "POST" }); toast("SOS closed"); loadSos() }
    catch (e: any) { toast(e.message, "bad") }
  }

  const actVerify = async (id: number, action: "approve" | "reject") => {
    try { await api(`/admin/verifications/${id}/action`, { method: "POST", body: { action } }); toast(action === "approve" ? "Approved" : "Rejected"); loadVerify(); loadStats() }
    catch (e: any) { toast(e.message, "bad") }
  }

  const statCards = [...(stats ? [
    { label: "Users", value: stats.users, icon: Users },
    { label: "Open rides", value: stats.openRides, icon: Car },
    { label: "Completed", value: stats.completedRides, icon: CheckCircle2 },
    { label: "Open reports", value: stats.openReports, icon: AlertTriangle, danger: true },
    { label: "Pending ID", value: stats.pendingVerify, icon: FileCheck2 },
    { label: "Open SOS", value: stats.openSos, icon: ShieldCheck, danger: true },
  ] : [])]

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide pb-8">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div className="flex gap-1 bg-stone-100 rounded-xl p-1 flex-1">
          {(["stats", "sos", "verify"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-lg text-[12.5px] font-display font-600 capitalize transition-all ${tab === t ? "bg-white text-ink shadow-sm" : "text-ink-3"}`}>
              {t}
            </button>
          ))}
        </div>
        <button onClick={reload} className="ml-2 w-9 h-9 rounded-xl bg-stone-100 flex items-center justify-center text-ink-3" aria-label="Refresh">
          <RefreshCw size={16} />
        </button>
      </div>

      {tab === "stats" && (
        <div className="px-4 space-y-4">
          {stats ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                {statCards.map(c => (
                  <div key={c.label} className="bg-surface rounded-2xl p-4" style={{ boxShadow: "var(--shadow-card)" }}>
                    <div className="flex items-center gap-2 mb-2">
                      <c.icon size={15} className={c.danger ? "text-red-500" : "text-brand"} />
                      <span className="text-[12px] text-ink-3">{c.label}</span>
                    </div>
                    <div className="font-display font-800 text-2xl text-ink">{c.value}</div>
                  </div>
                ))}
              </div>
              <div className="bg-surface rounded-2xl p-4" style={{ boxShadow: "var(--shadow-card)" }}>
                <div className="font-display font-600 text-[13px] text-ink-2 mb-3">Exports</div>
                <div className="grid grid-cols-3 gap-2">
                  {["users", "rides", "payments"].map(t => (
                    <a key={t} href={`/api/admin/export/${t}`} className="flex flex-col items-center gap-1 rounded-xl border border-line py-3 text-brand hover:bg-brand-50 transition-colors">
                      <Download size={16} />
                      <span className="text-[11px] font-display font-600 capitalize">{t}.csv</span>
                    </a>
                  ))}
                </div>
                <p className="text-[11px] text-ink-3 mt-3">A full DB snapshot is also written to server/backups daily.</p>
              </div>
            </>
          ) : (
            <div className="shimmer rounded-2xl" style={{ height: 320 }} />
          )}
        </div>
      )}

      {tab === "sos" && (
        <div className="px-4 space-y-3">
          {sos.length === 0 ? (
            <div className="text-center py-16 text-ink-3"><div className="text-5xl mb-3">🛡️</div>No SOS alerts yet</div>
          ) : sos.map(a => (
            <div key={a.id} className="bg-surface rounded-2xl p-4 border-l-4" style={{ boxShadow: "var(--shadow-card)", borderLeftColor: a.status === "open" ? "#ef4444" : "#6b7280" }}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-display font-700 text-[14px] text-ink">{a.user_name}
                    {a.lat != null && <span className="text-[11px] text-ink-3 font-mono ml-1">· {Number(a.lat).toFixed(4)}, {Number(a.lng).toFixed(4)}</span>}
                  </div>
                  <div className="text-[12px] text-ink-3">{a.user_phone} · {relativeTime(a.created_at)}</div>
                </div>
                <Badge variant={a.status === "open" ? "danger" : "muted"}>{a.status}</Badge>
              </div>
              <p className="text-[13px] text-ink-2 font-body mb-2">{a.message}</p>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-ink-3">{a.ride_id ? `Ride #${a.ride_id} · ${a.from_name} → ${a.to_name}` : "No ride attached"}</span>
                {a.status === "open" && (
                  <button onClick={() => closeSos(a.id)} className="btn-brand px-3 py-1.5 rounded-lg text-[12px]">Mark safe</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "verify" && (
        <div className="px-4 space-y-3">
          {verifications.length === 0 ? (
            <div className="text-center py-16 text-ink-3"><div className="text-5xl mb-3">🪪</div>No verifications queued</div>
          ) : verifications.map(v => (
            <div key={v.id} className="bg-surface rounded-2xl p-4" style={{ boxShadow: "var(--shadow-card)" }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <AvatarCircle initial={initials(v.user_name)} color={hashColor(v.user_name)} size={36} />
                  <div>
                    <div className="font-display font-700 text-[14px] text-ink">{v.user_name}</div>
                    <div className="text-[11px] text-ink-3">{v.user_email}</div>
                  </div>
                </div>
                <Badge variant={v.status === "pending" ? "pending" : v.status === "approved" ? "success" : "danger"}>{v.status}</Badge>
              </div>
              <div className="flex items-center justify-between bg-stone-50 rounded-xl px-3 py-2 mb-3">
                <span className="text-[12px] text-ink-2 capitalize font-display font-600">{v.doc_type?.replace("_", " ")}</span>
                <span className="text-[11px] text-ink-3">{relativeTime(v.created_at)}</span>
              </div>
              {v.status === "pending" && (
                <div className="flex gap-2">
                  <button onClick={() => actVerify(v.id, "approve")} className="btn-brand flex-1 py-2.5 rounded-xl text-[13px] flex items-center justify-center gap-1.5">
                    <CheckCircle2 size={15} /> Approve
                  </button>
                  <button onClick={() => actVerify(v.id, "reject")} className="btn-outline flex-1 py-2.5 rounded-xl text-[13px] flex items-center justify-center gap-1.5 border-red-200 text-red-500">
                    <XCircle size={15} /> Reject
                  </button>
                </div>
              )}
              {v.admin_note && <p className="text-[12px] text-ink-3 mt-2">Note: {v.admin_note}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}