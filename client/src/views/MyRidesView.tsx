import { useState, useEffect, useCallback } from "react"
import { Calendar, Users, MessageCircle, Info } from "lucide-react"
import { api } from "../api.js"
import { useToast } from "../Toast.jsx"
import { VEHICLE_EMOJI, initials, hashColor, humanDate, humanTime } from "../lib.ts"
import { Badge, AvatarCircle } from "../components/ui.tsx"
import type { View } from "../types.ts"

const BOOK_REASONS = ["Plans changed", "Found another ride", "Driver responsive issues", "Trip too expensive", "Other"]
const RIDE_REASONS = ["Vehicle broke down", "Emergency", "No bookings", "Personal reason", "Other"]

export function MyRidesView({ onNavigate, onOpenChat }: { onNavigate: (v: View) => void; onOpenChat: (rideId: number, name: string) => void }) {
  const [tab, setTab] = useState<"upcoming" | "past" | "offered">("upcoming")
  const [bookings, setBookings] = useState<any[]>([])
  const [offered, setOffered] = useState<any[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelTarget, setCancelTarget] = useState<{ kind: "book" | "ride"; id: number } | null>(null)
  const [cancelReason, setCancelReason] = useState("")
  const toast = useToast()

  const load = useCallback(async () => {
    try {
      const [b, o, h] = await Promise.all([
        api("/requests/mine").catch(() => ({ requests: [] })),
        api("/rides/mine").catch(() => ({ rides: [] })),
        api("/rides/history").catch(() => ({ joined: [], offered: [] })),
      ])
      setBookings(b.requests || [])
      setOffered(o.rides || [])
      setHistory([...(h.joined || []), ...(h.offered || [])])
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const upcoming = bookings.filter(q => q.status === "pending" || q.status === "accepted")
  const past = history.filter(h => h.status === "completed")

  const confirmCancel = async () => {
    if (!cancelTarget) return
    const reason = cancelReason.trim() || null
    try {
      if (cancelTarget.kind === "book") {
        await api(`/requests/${cancelTarget.id}/cancel`, { method: "POST", body: { reason } })
        toast(reason ? "Booking cancelled — full refund initiated" : "Booking cancelled")
      } else {
        await api(`/rides/${cancelTarget.id}/cancel`, { method: "POST", body: { reason } })
        toast("Ride cancelled — riders notified & refunded")
      }
      setCancelTarget(null)
      setCancelReason("")
      load()
    } catch (err: any) {
      toast(err.message || "Couldn't cancel", "bad")
    }
  }

  const completeRide = async (id: number) => {
    try {
      await api(`/rides/${id}/complete`, { method: "POST" })
      toast("Ride marked completed")
      load()
    } catch (err: any) {
      toast(err.message || "Couldn't complete", "bad")
    }
  }

  const statusBadge = (s: string) => {
    const map: Record<string, { v: any; t: string }> = {
      accepted: { v: "success", t: "Confirmed" },
      pending:  { v: "pending", t: "Pending" },
      rejected: { v: "danger", t: "Declined" },
      cancelled: { v: "muted", t: "Cancelled" },
      completed: { v: "success", t: "Completed" },
      open: { v: "pending", t: "Open" },
      full: { v: "pending", t: "Full" },
    }
    const m = map[s] || { v: "muted" as any, t: s }
    return <Badge variant={m.v}>{m.t}</Badge>
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide">
      <div className="flex gap-1 mx-4 mt-3 p-1 bg-stone-100 rounded-xl mb-4">
        {(["upcoming", "past", "offered"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-[13px] font-display font-600 transition-all capitalize
              ${tab === t ? "bg-white text-ink shadow-sm" : "text-ink-3"}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="px-4 pb-8 space-y-3">
        {loading ? (
          [0, 1, 2].map(i => <div key={i} className="rounded-2xl shimmer" style={{ height: 180 }} />)
        ) : tab === "upcoming" && upcoming.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">🚗</div>
            <div className="font-display font-700 text-ink text-lg mb-1">No upcoming rides</div>
            <p className="text-ink-3 text-sm mb-4">Find a ride or offer one to get going!</p>
            <button className="btn-brand px-6 py-3 rounded-xl text-[14px]" onClick={() => onNavigate("find")}>
              Find a Ride
            </button>
          </div>
        ) : tab === "upcoming" ? (
          upcoming.map(q => (
            <div key={q.id} className="bg-surface rounded-2xl p-4 card-lift" style={{ boxShadow: "var(--shadow-card)" }}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-display font-700 text-[15px] text-ink">{q.from_name} → {q.to_name}</div>
                  <div className="text-[12px] text-ink-3 mt-0.5">Owner · {q.owner_name}</div>
                </div>
                {statusBadge(q.status)}
              </div>
              <div className="flex items-center gap-4 text-[12px] text-ink-3 mb-3 flex-wrap">
                <span className="flex items-center gap-1"><Calendar size={11} /> {humanDate(q.depart_at)} · {humanTime(q.depart_at)}</span>
                <span className="flex items-center gap-1"><Users size={11} /> {q.seats} seat</span>
              </div>
              <div className="flex items-center justify-between border-t border-line pt-3">
                <div>
                  <div className="text-[11px] text-ink-3">Per seat</div>
                  <div className="font-display font-800 text-lg text-ink">₹{q.price}</div>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                {q.status === "accepted" && (
                  <button
                    className="btn-outline flex-1 py-2.5 rounded-xl text-[13px]"
                    onClick={() => onOpenChat(q.ride_id, q.owner_name)}
                  >
                    <MessageCircle size={14} className="inline mr-1" />Message
                  </button>
                )}
                {q.status !== "rejected" && q.status !== "cancelled" && (
                  <button
                    className="flex-1 py-2.5 rounded-xl text-[13px] font-display font-600 bg-stone-100 text-ink-3"
                    onClick={() => { setCancelTarget({ kind: "book", id: q.id }); setCancelReason("") }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ))
        ) : tab === "past" ? (
          past.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-5xl mb-3">📅</div>
              <div className="font-display font-700 text-ink text-lg mb-1">No past rides yet</div>
            </div>
          ) : past.map(h => (
            <div key={h.id} className="bg-surface rounded-2xl p-4" style={{ boxShadow: "var(--shadow-card)" }}>
              <div className="flex items-center justify-between mb-2">
                <div className="font-display font-700 text-[15px] text-ink">{h.from_name} → {h.to_name}</div>
                {statusBadge(h.status)}
              </div>
              <div className="text-[12px] text-ink-3 mb-2">{humanDate(h.depart_at)} · {h.owner_name}</div>
              <div className="flex items-center justify-between">
                <span className="font-display font-700 text-ink">₹{h.price}</span>
              </div>
            </div>
          ))
        ) : offered.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">🚗</div>
            <div className="font-display font-700 text-ink text-lg mb-1">No rides offered yet</div>
            <p className="text-ink-3 text-sm mb-4">Share your next trip and help fellow travelers!</p>
            <button className="btn-brand px-6 py-3 rounded-xl text-[14px]" onClick={() => onNavigate("offer")}>
              Offer a Ride
            </button>
          </div>
        ) : (
          offered.map(r => (
            <div key={r.id} className="bg-surface rounded-2xl p-4 card-lift" style={{ boxShadow: "var(--shadow-card)" }}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-display font-700 text-[15px] text-ink">{r.from_name} → {r.to_name}</div>
                  <div className="text-[12px] text-ink-3 mt-0.5">{VEHICLE_EMOJI[r.vehicle_type] || "🚗"} {r.vehicle_model}</div>
                </div>
                {statusBadge(r.status)}
              </div>
              <div className="flex items-center gap-4 text-[12px] text-ink-3 mb-3 flex-wrap">
                <span className="flex items-center gap-1"><Calendar size={11} /> {humanDate(r.depart_at)} · {humanTime(r.depart_at)}</span>
                <span className="flex items-center gap-1"><Users size={11} /> {r.seats_taken || 0}/{r.seats_total} seats</span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-ink-3 mb-3">
                <Info size={11} /> Paid riders get an instant full refund whenever a ride is cancelled before departure.
              </div>
              {(r.requests || []).length > 0 && (
                <div className="border-t border-line pt-3 space-y-2 mb-3">
                  {r.requests.map((q: any) => (
                    <div key={q.id} className="flex items-center justify-between bg-stone-50 rounded-xl px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <AvatarCircle initial={initials(q.rider_name)} color={hashColor(q.rider_name)} size={28} />
                        <div className="min-w-0">
                          <div className="text-[13px] font-display font-600 text-ink truncate">{q.rider_name}</div>
                          <div className="text-[11px] text-ink-3">{q.seats} seat{q.seats > 1 ? "s" : ""}</div>
                        </div>
                      </div>
                      {q.status === "pending" ? (
                        <div className="flex gap-1.5 flex-shrink-0">
                          <button className="btn-brand px-3 py-1.5 rounded-lg text-[12px]" onClick={async () => {
                            try { await api(`/requests/${q.id}/accept`, { method: "POST" }); toast("Request accepted"); load() }
                            catch (e: any) { toast(e.message, "bad") }
                          }}>Accept</button>
                          <button className="btn-outline px-3 py-1.5 rounded-lg text-[12px]" onClick={async () => {
                            try { await api(`/requests/${q.id}/reject`, { method: "POST" }); toast("Request rejected"); load() }
                            catch (e: any) { toast(e.message, "bad") }
                          }}>Decline</button>
                        </div>
                      ) : (
                        <Badge variant={q.status === "accepted" ? "success" : "muted"}>{q.status}</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                {r.status === "open" && (
                  <button className="btn-outline flex-1 py-2.5 rounded-xl text-[13px]" onClick={() => completeRide(r.id)}>
                    Complete
                  </button>
                )}
                {(r.status === "open" || r.status === "full") && (
                  <button className="flex-1 py-2.5 rounded-xl text-[13px] font-display font-600 bg-stone-100 text-ink-3" onClick={() => { setCancelTarget({ kind: "ride", id: r.id }); setCancelReason("") }}>
                    Cancel ride
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {cancelTarget && (
        <div className="absolute inset-0 z-40 bg-black/40 flex items-end" onClick={() => setCancelTarget(null)}>
          <div className="w-full bg-surface rounded-t-3xl p-5 view-enter" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-line-2 rounded-full mx-auto mb-4" />
            <div className="font-display font-700 text-[16px] text-ink mb-1">
              {cancelTarget.kind === "book" ? "Cancel this booking?" : "Cancel this ride?"}
            </div>
            <div className="text-[13px] text-ink-3 mb-3">
              {cancelTarget.kind === "book" ? "Your fare (if paid) is refunded instantly back to your wallet." : "All paid riders are instantly and fully refunded."}
            </div>
            <div className="mb-3">
              <label className="font-display font-600 text-[13px] text-ink-2 mb-1.5 block">Reason (optional)</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {(cancelTarget.kind === "book" ? BOOK_REASONS : RIDE_REASONS).map(rsn => (
                  <button key={rsn} onClick={() => setCancelReason(rsn)}
                    className={`rounded-full px-3 py-2 text-[12.5px] font-display font-600 border-2 transition-all ${cancelReason === rsn ? "border-brand text-brand bg-brand-50" : "border-line text-ink-3"}`}>
                    {rsn}
                  </button>
                ))}
              </div>
              <input className="rm-input" placeholder="Or write your own…" value={cancelReason} onChange={e => setCancelReason(e.target.value)} maxLength={200} />
            </div>
            <div className="flex gap-3">
              <button className="btn-outline flex-1 py-3 rounded-xl text-[14px]" onClick={() => setCancelTarget(null)}>Keep it</button>
              <button className="flex-1 py-3 rounded-xl text-[14px] font-display font-600 bg-red-500 text-white" onClick={confirmCancel}>
                {cancelTarget.kind === "book" ? "Cancel & refund" : "Cancel ride"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}