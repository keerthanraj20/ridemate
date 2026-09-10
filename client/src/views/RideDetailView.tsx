import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import {
  MapPin, Calendar, Users, Star, CheckCircle2, ShieldAlert, Navigation, Locate,
  MessageCircle, Heart, Share2, ChevronRight, Info, Crosshair,
} from "lucide-react"
import { api } from "../api.js"
import { useToast } from "../Toast.jsx"
import { toRide, humanDate, humanTime, leaveIn, initials, hashColor } from "../lib.ts"
import { AvatarCircle, Badge, Stars, RequestSheet } from "../components/ui.tsx"
import type { Ride, View } from "../types.ts"

export function RideDetailView({ rideId, onNavigate, onOpenChat }: { rideId: number; onNavigate: (v: View) => void; onOpenChat: (rideId: number, name: string) => void }) {
  const [data, setData] = useState<any | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [requesting, setRequesting] = useState(false)
  const [following, setFollowing] = useState(false)
  const [live, setLive] = useState(false)
  const [liveLocs, setLiveLocs] = useState<any[]>([])
  const [sharingNow, setSharingNow] = useState(false)
  const toast = useToast()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const liveRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tripRef = useRef<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api(`/rides/${rideId}`)
      setData(d)
      setFollowing(false)
    } catch (e: any) {
      setError(e.message || "Ride not found")
    } finally {
      setLoading(false)
    }
  }, [rideId])

  useEffect(() => { load() }, [load])

  const rideObj: Ride | null = useMemo(() => {
    if (!data) return null
    return toRide({ ...data.ride, owner_name: data.owner?.name, owner_rating: data.owner_rating, owner_ratings_count: data.owner_ratings_count }, false)
  }, [data])

  const pollLive = useCallback(async () => {
    try {
      const d = await api(`/trips/ride/${rideId}`)
      setLiveLocs(d.locations || [])
    } catch { /* transient */ }
  }, [rideId])

  const toggleLive = async () => {
    if (live) {
      if (tripRef.current) await api(`/trips/${tripRef.current}/end`, { method: "POST" }).catch(() => {})
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
      setLive(false)
      setSharingNow(false)
      toast("Live sharing stopped")
      return
    }
    toast("Starting live location sharing…")
    try {
      const start = await api("/trips/start", { method: "POST", body: { ride_id: rideId } })
      tripRef.current = start.trip.id
      setLive(true)
      const report = () => {
        if (!("geolocation" in navigator)) return
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude, longitude } = pos.coords
            const t = tripRef.current
            if (!t) return
            void api(`/trips/${t}/location`, { method: "POST", body: { lat: latitude, lng: longitude } }).catch(() => {})
            setSharingNow(true)
          },
          () => { setSharingNow(false) },
          { enableHighAccuracy: true, timeout: 15000 }
        )
      }
      report()
      intervalRef.current = setInterval(report, 15000)
      toast("Sharing — your live location is visible to the other party", undefined as any)
    } catch (e: any) {
      toast(e.message || "Couldn't start tracking", "bad")
    }
  }

  useEffect(() => {
    if (!data?.is_participant) return
    void pollLive()
    liveRef.current = setInterval(pollLive, 5000)
    return () => { if (liveRef.current) clearInterval(liveRef.current) }
  }, [data?.is_participant, pollLive])

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (liveRef.current) clearInterval(liveRef.current)
  }, [])

  const sos = async () => {
    try {
      await api("/safety/sos", { method: "POST", body: { ride_id: rideId } })
      toast("SOS raised — our safety team has been notified")
    } catch (e: any) {
      toast(e.message || "Couldn't raise SOS", "bad")
    }
  }

  const toggleFollow = async () => {
    if (!data) return
    try {
      if (following) {
        await api(`/users/${data.owner.id}/follow`, { method: "DELETE" })
        setFollowing(false)
        toast("Unfollowed")
      } else {
        await api(`/users/${data.owner.id}/follow`, { method: "POST" })
        setFollowing(true)
        toast(`Following ${data.owner.name}`)
      }
    } catch (e: any) {
      toast(e.message || "Couldn't update follow", "bad")
    }
  }

  const share = async () => {
    const text = `SaathYaan · ${r.from_name} → ${r.to_name} · ${humanDate(r.depart_at)} ${humanTime(r.depart_at)} · ${perSeat}₹/seat`
    try {
      if (navigator.share) { await navigator.share({ title: "SaathYaan trip", text }); return }
      await navigator.clipboard.writeText(text)
      toast("Trip details copied to clipboard")
    } catch { /* user dismissed */ }
  }

  if (loading) return <div className="flex-1 flex items-center justify-center"><div className="shimmer rounded-2xl" style={{ width: 300, height: 300 }} /></div>
  if (error || !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="text-5xl mb-3">🧭</div>
        <div className="font-display font-700 text-ink text-lg mb-1">Ride unavailable</div>
        <p className="text-ink-3 text-sm mb-4">{error || "This ride may have been removed."}</p>
        <button className="btn-brand px-6 py-3 rounded-xl text-[14px]" onClick={() => onNavigate("find")}>Find another ride</button>
      </div>
    )
  }

  const r = data.ride
  const owner = data.owner
  const leave = leaveIn(r.depart_at)
  const perSeat = r.price || 0
  const fareEstimate = Math.round(perSeat * 6.0) // rough per-km feel for the split explainer

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide pb-10">
      <div className="hero-gradient px-5 pt-5 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <AvatarCircle initial={initials(owner?.name || "?")} color={hashColor(owner?.name || "?")} size={52} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-display font-700 text-[17px] text-white">{owner?.name}</span>
              {owner?.id_verified || r.owner_verified ? (
                <span className="inline-flex items-center gap-0.5 text-[11px] font-display font-600 text-amber-200">
                  <CheckCircle2 size={12} /> Verified
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="flex items-center gap-1 text-white/80">
                <Star size={12} className="fill-amber-300 text-amber-300" />
                <b>{data.owner_rating ? data.owner_rating.toFixed(1) : "New"}</b>
                {data.owner_ratings_count ? <span className="text-white/60">({data.owner_ratings_count})</span> : null}
              </span>
              {data.is_owner && <Badge variant="brand">You're the driver</Badge>}
            </div>
          </div>
          {data.is_owner ? null : (
            <button
              onClick={toggleFollow}
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${following ? "bg-amber-400/90" : "bg-white/15"}`}
              aria-label="Follow owner"
              title={following ? "Unfollow" : "Follow this driver for new ride alerts"}
            >
              <Heart size={18} className={following ? "text-white fill-white" : "text-white"} />
            </button>
          )}
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-xl">
          <div className="flex items-stretch gap-3">
            <div className="flex flex-col items-center py-1">
              <div className="w-2.5 h-2.5 rounded-full bg-brand border-2 border-brand-light" />
              <div className="w-px flex-1 bg-line my-1" />
              <MapPin size={13} className="text-cta-dark fill-cta-light" />
            </div>
            <div className="flex-1 flex flex-col gap-3">
              <div>
                <div className="font-display font-700 text-[15px] text-ink">{r.from_name}</div>
                <div className="text-[12px] text-ink-3">Pickup</div>
              </div>
              <div>
                <div className="font-display font-700 text-[15px] text-ink">{r.to_name}</div>
                <div className="text-[12px] text-ink-3">Drop</div>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="font-display font-800 text-2xl text-ink">₹{perSeat}</div>
              <div className="text-[11px] text-ink-3">per seat</div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap mt-4 pt-3 border-t border-line">
            {leave ? <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-cta-light text-cta-dark text-[11px] font-display font-700"><Navigation size={10} /> {leave}</span> : null}
            <span className="flex items-center gap-1 text-[12px] text-ink-3 font-body"><Calendar size={11} /> {humanDate(r.depart_at)} · {humanTime(r.depart_at)}</span>
            <span className="flex items-center gap-1 text-[12px] text-ink-3 font-body"><Users size={11} /> {r.seats_left} of {r.seats_total} seats</span>
          </div>
        </div>
      </div>

      <div className="px-4 space-y-4 -mt-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-surface rounded-2xl p-3.5" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="text-[11px] text-ink-3 mb-1">Vehicle</div>
            <div className="font-display font-600 text-[14px] text-ink">{r.vehicle_type} · {r.vehicle_model || r.vehicle_type}</div>
          </div>
          <div className="bg-surface rounded-2xl p-3.5" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="text-[11px] text-ink-3 mb-1">Fair split</div>
            <div className="font-display font-600 text-[14px] text-ink"><Info size={11} className="inline mr-0.5 text-brand" />No drivers fee · ~₹{fareEstimate}/km</div>
          </div>
        </div>

        {r.notes ? (
          <div className="bg-surface rounded-2xl p-4" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="font-display font-600 text-[13px] text-ink-2 mb-1">Notes from {owner?.name}</div>
            <p className="text-[13px] text-ink-3 font-body leading-relaxed">{r.notes}</p>
          </div>
        ) : null}

        {data.is_participant || data.is_owner ? (
          <div className="bg-surface rounded-2xl p-4" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="flex items-center justify-between mb-2">
              <div className="font-display font-600 text-[13px] text-ink-2">🛰️ Live trip location</div>
              <Badge variant={live ? "success" : "muted"}>{live ? "Sharing" : "Off"}</Badge>
            </div>
            {!data.is_owner && (
              <button onClick={toggleLive} className="btn-brand w-full py-3 rounded-xl text-[14px] flex items-center justify-center gap-2 mb-3">
                {live ? <Locate size={16} /> : <Crosshair size={16} />}
                {live ? (sharingNow ? "Sharing… tap to stop" : "Update location · tap to stop") : "Share my live location"}
              </button>
            )}
            {liveLocs.length > 0 && (
              <div className="space-y-2">
                {liveLocs.map(l => (
                  <div key={l.trip_id} className="flex items-center justify-between bg-stone-50 rounded-xl px-3 py-2">
                    <span className="text-[13px] font-display font-600 text-ink">{l.role === "owner" ? owner?.name : (data.is_owner ? "Rider" : owner?.name)}</span>
                    {l.lat != null ? (
                      <span className="text-[11px] text-ink-3 font-mono">{Number(l.lat).toFixed(5)}, {Number(l.lng).toFixed(5)}</span>
                    ) : (
                      <span className="text-[11px] text-ink-3">no signal yet</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {(data.acceptedRiders || []).length > 0 && (data.is_participant || data.is_owner) && (
          <div className="bg-surface rounded-2xl p-4" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="font-display font-600 text-[13px] text-ink-2 mb-2">👥 On this ride</div>
            <div className="flex flex-wrap gap-2">
              {(data.acceptedRiders as any[]).map((rid: any) => (
                <span key={rid.rider_id} className="inline-flex items-center gap-1.5 bg-stone-50 rounded-full px-3 py-1.5 text-[12.5px] font-display font-600 text-ink">
                  <AvatarCircle initial={initials(rid.name)} color={hashColor(rid.name)} size={18} />
                  {rid.name}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="sticky bottom-3 flex gap-2 z-10">
          {data.is_owner || data.is_participant ? (
            <>
              <button onClick={() => onOpenChat(rideId, owner?.name)} className="btn-outline flex-1 py-3.5 rounded-xl text-[14px] flex items-center justify-center gap-2 bg-surface">
                <MessageCircle size={16} /> Message
              </button>
              <button onClick={share} className="btn-brand flex-1 py-3.5 rounded-xl text-[14px] flex items-center justify-center gap-2">
                <Share2 size={16} /> Share trip
              </button>
            </>
          ) : (
            <button
              onClick={() => setRequesting(true)}
              disabled={(data.my_request?.status === "accepted" || data.my_request?.status === "pending")}
              className={`${data.my_request ? "btn-outline bg-surface" : "btn-cta"} flex-1 py-3.5 rounded-xl text-[15px] font-display font-700 flex items-center justify-center`}
            >
              {data.my_request?.status === "accepted" ? "✓ Booked" : data.my_request?.status === "pending" ? "Request sent" : `Request seat · ₹${perSeat}`}
            </button>
          )}
        </div>

        <button onClick={sos} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-red-200 text-red-500 font-display font-600 text-[14px] bg-red-50/60">
          <ShieldAlert size={16} /> Emergency SOS
        </button>
      </div>

      {requesting && rideObj && (
        <RequestSheet
          ride={rideObj}
          onClose={() => setRequesting(false)}
          onDone={() => { setRequesting(false); toast("Request sent 🎉"); load() }}
        />
      )}
    </div>
  )
}