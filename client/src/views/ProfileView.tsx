import { useState, useEffect } from "react"
import {
  CheckCircle2, Edit3, Bookmark, History, MessageCircle, TrendingUp, Wallet, ChevronRight, LogOut,
  Gift, ShieldCheck, Trophy, BarChart3, FileCheck2, Share2,
} from "lucide-react"
import { api } from "../api.js"
import { useToast } from "../Toast.jsx"
import { useAuth } from "../AuthContext.jsx"
import { initials } from "../lib.ts"
import { Badge } from "../components/ui.tsx"
import type { View } from "../types.ts"

export function ProfileView({ onNavigate, onLogout }: { onNavigate: (v: View) => void; onLogout: () => void }) {
  const { user } = useAuth()
  const [stats, setStats] = useState({ ridesOffered: 0, ridesJoined: 0, avgRating: null as number | null })
  const [editMode, setEditMode] = useState(false)
  const [bio, setBio] = useState("")
  const toast = useToast()

  // growth data: referral credit + streaks + rank
  const [growth, setGrowth] = useState<{ code: string; credit: number } | null>(null)
  const [myStats, setMyStats] = useState<any | null>(null)
  const [verifySheet, setVerifySheet] = useState(false)
  const [referSheet, setReferSheet] = useState(false)
  const [refCode, setRefCode] = useState("")
  const [docType, setDocType] = useState("driving_license")
  const [docImage, setDocImage] = useState("")
  const [verifications, setVerifications] = useState<any[]>([])

  useEffect(() => {
    let on = true
    ;(async () => {
      try {
        const data = await api("/profile")
        if (on) {
          setStats({ ridesOffered: data.stats?.ridesOffered || 0, ridesJoined: data.stats?.ridesJoined || 0, avgRating: data.stats?.avgRating || null })
          setBio(data.user?.bio || "")
        }
      } catch { /* ignore */ }
    })()
    ;(async () => {
      try { const r = await api("/referral"); if (on) setGrowth(r) } catch { /* ignore */ }
    })()
    ;(async () => {
      try { const s = await api("/me/stats"); if (on) setMyStats(s) } catch { /* ignore */ }
    })()
    return () => { on = false }
  }, [])

  const saveBio = async () => {
    try {
      const data = await api("/profile", { method: "PUT", body: { name: user?.name, phone: user?.phone, bio } })
      toast("Profile updated")
      setEditMode(false)
      void data
    } catch (err: any) {
      toast(err.message || "Couldn't update", "bad")
    }
  }

  const redeemReferral = async () => {
    try {
      const d = await api("/referral/redeem", { method: "POST", body: { code: refCode } })
      toast(d.message || "Referral redeemed 🎉")
      setReferSheet(false)
      const r = await api("/referral")
      setGrowth(r)
    } catch (err: any) {
      toast(err.message || "Couldn't redeem", "bad")
    }
  }

  const readDoc = (file: File) => {
    if (file && !file.type.startsWith("image/")) { toast("Upload an image", "bad"); return }
    if (file && file.size > 1_000_000) { toast("Image must be under 1 MB", "bad"); return }
    const reader = new FileReader()
    reader.onload = () => setDocImage(String(reader.result || ""))
    reader.readAsDataURL(file)
  }

  const submitVerify = async () => {
    if (!docImage) { toast("Pick a photo of your document", "bad"); return }
    try {
      const d = await api("/verifications", { method: "POST", body: { doc_type: docType, doc_image: docImage } })
      toast(d.message || "Submitted!")
      setVerifySheet(false); setDocImage("")
      const v = await api("/verifications")
      setVerifications(v.verifications || [])
    } catch (err: any) {
      toast(err.message || "Couldn't submit", "bad")
    }
  }

  const copyCode = async () => {
    if (!growth?.code) return
    try { await navigator.clipboard.writeText(growth.code); toast("Referral code copied") }
    catch { toast(growth.code) }
  }

  const statCards = [
    { label: "Rides taken", value: stats.ridesJoined },
    { label: "Rides offered", value: stats.ridesOffered },
    { label: "Avg rating", value: stats.avgRating ? `${stats.avgRating} ⭐` : "—" },
  ]

  const name = user?.name || "You"
  const avatarStyle = user?.avatar
    ? { backgroundImage: `url(${user.avatar})`, backgroundSize: "cover", backgroundPosition: "center" }
    : { background: "rgba(255,255,255,0.2)" }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide pb-8">
      <div className="hero-gradient px-5 pt-6 pb-10 relative">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-3xl font-display font-800 text-white shadow-lg" style={avatarStyle}>
              {!user?.avatar ? initials(name) : ""}
            </div>
            <div>
              <div className="font-display font-800 text-xl text-white">{name}</div>
              <div className="text-white/70 text-[13px]">{user?.email}</div>
              <div className="flex items-center gap-1 mt-1">
                <Badge variant="brand">
                  {user?.id_verified ? <><CheckCircle2 size={10} /> ID Verified</> : <><ShieldCheck size={10} /> Member</>}
                </Badge>
                {user?.id_verified && <Badge variant="success"><CheckCircle2 size={10} /> Verified</Badge>}
              </div>
            </div>
          </div>
          <button
            onClick={() => setEditMode(v => !v)}
            className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center"
            aria-label="Edit"
          >
            <Edit3 size={16} className="text-white" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {statCards.map(s => (
            <div key={s.label} className="bg-white/15 backdrop-blur-sm rounded-xl p-3 text-center">
              <div className="font-display font-800 text-xl text-white">{s.value}</div>
              <div className="text-white/70 text-[11px]">{s.label}</div>
            </div>
          ))}
        </div>

        {myStats && (
          <div className="flex items-center justify-between mt-3 bg-white/10 rounded-xl px-4 py-3 text-white">
            <div className="text-center flex-1">
              <div className="font-display font-800 text-xl">{myStats.completed}</div>
              <div className="text-white/60 text-[10px]">Trips done</div>
            </div>
            <div className="text-center flex-1 border-x border-white/10">
              <div className="font-display font-800 text-xl">{myStats.km} km</div>
              <div className="text-white/60 text-[10px]">Logged</div>
            </div>
            <div className="text-center flex-1">
              <div className="font-display font-800 text-xl">{myStats.streakWeeks} 🔥</div>
              <div className="text-white/60 text-[10px]">Week streak</div>
            </div>
          </div>
        )}
      </div>

      <div className="px-4 -mt-4">
        {editMode && (
          <div className="bg-surface rounded-2xl p-4 mb-4 shadow-lg" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="font-display font-700 text-[14px] text-ink mb-2">About you</div>
            <textarea
              className="rm-input resize-none"
              rows={3}
              placeholder="Tell fellow travelers a bit about yourself…"
              value={bio}
              onChange={e => setBio(e.target.value)}
            />
            <div className="flex gap-2 mt-3">
              <button className="btn-brand flex-1 py-2.5 rounded-xl text-[13px]" onClick={saveBio}>Save</button>
              <button className="btn-outline flex-1 py-2.5 rounded-xl text-[13px]" onClick={() => setEditMode(false)}>Cancel</button>
            </div>
          </div>
        )}

        {/* Rewards + identity */}
        {(growth || myStats) && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <button onClick={() => setReferSheet(true)} className="bg-surface rounded-2xl p-3.5 text-left card-lift" style={{ boxShadow: "var(--shadow-card)" }}>
              <Gift size={17} className="text-brand mb-1" />
              <div className="font-display font-700 text-[13px] text-ink">Wallet / Refer & earn</div>
              <div className="text-[11px] text-ink-3">₹{growth?.credit || 0} credit · code <b className="text-brand">{growth?.code || "—"}</b></div>
            </button>
            <button onClick={() => setVerifySheet(true)} className="bg-surface rounded-2xl p-3.5 text-left card-lift" style={{ boxShadow: "var(--shadow-card)" }}>
              <FileCheck2 size={17} className="text-brand mb-1" />
              <div className="font-display font-700 text-[13px] text-ink">{user?.id_verified ? "ID verified ✅" : "Verify your ID"}</div>
              <div className="text-[11px] text-ink-3">{user?.id_verified ? "Green badge unlocked" : "Get the green badge"}</div>
            </button>
          </div>
        )}

        <div className="bg-surface rounded-2xl overflow-hidden shadow-lg" style={{ boxShadow: "var(--shadow-card)" }}>
          {[
            { icon: Bookmark, label: "Saved routes", sub: "Your favorite trips", onClick: () => onNavigate("saved") },
            { icon: Wallet, label: "Payments & escrow", sub: "Fare holds, refunds & payouts", onClick: () => onNavigate("payments") },
            { icon: Trophy, label: "Leaderboard", sub: myStats?.rank ? `You're rank #${myStats.rank} this period` : "Where you stand", onClick: () => onNavigate("find") },
            { icon: BarChart3, label: "My stats", sub: `${myStats?.streakWeeks || 0}-week streak · ${myStats?.km || 0} km logged`, onClick: () => onNavigate("rides") },
            { icon: History, label: "Ride history", sub: "Past and completed rides", onClick: () => onNavigate("history") },
            { icon: MessageCircle, label: "Messages", sub: "Your conversations", onClick: () => onNavigate("messages") },
            { icon: TrendingUp, label: "My rides", sub: "Offered rides & requests", onClick: () => onNavigate("rides") },
          ].map((item, i) => (
            <button
              key={i}
              onClick={item.onClick}
              className="w-full flex items-center gap-3 px-4 py-4 hover:bg-stone-50 transition-colors text-left border-b border-line/60 last:border-0"
            >
              <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
                <item.icon size={17} className="text-brand" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display font-600 text-[14px] text-ink">{item.label}</div>
                <div className="text-[12px] text-ink-3 truncate">{item.sub}</div>
              </div>
              <ChevronRight size={16} className="text-ink-3" />
            </button>
          ))}
          {user?.is_admin && (
            <button
              onClick={() => onNavigate("admin")}
              className="w-full flex items-center gap-3 px-4 py-4 hover:bg-red-50 transition-colors text-left border-b border-line/60"
            >
              <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                <ShieldCheck size={17} className="text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display font-600 text-[14px] text-ink">Admin console</div>
                <div className="text-[12px] text-ink-3 truncate">Stats, SOS, ID review & exports</div>
              </div>
              <ChevronRight size={16} className="text-ink-3" />
            </button>
          )}
        </div>

        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 mt-4 py-3.5 rounded-xl border border-red-200 text-red-500 font-display font-600 text-[14px] hover:bg-red-50 transition-colors"
        >
          <LogOut size={16} /> Sign out
        </button>
      </div>

      {/* Referral sheet */}
      {referSheet && (
        <div className="absolute inset-0 z-40 bg-black/40 flex items-end" onClick={() => setReferSheet(false)}>
          <div className="w-full bg-surface rounded-t-3xl p-5 view-enter" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-line-2 rounded-full mx-auto mb-4" />
            <div className="flex items-center gap-2 font-display font-700 text-[16px] text-ink mb-1"><Gift size={17} className="text-brand" /> Refer & earn</div>
            <p className="text-[13px] text-ink-3 mb-4">Share your code — when a friend joins, you both get ₹50 credit.</p>
            {growth && (
              <div className="flex items-center justify-between bg-brand-50 rounded-xl px-4 py-3 mb-4">
                <span className="font-display font-800 text-lg text-brand tracking-widest">{growth.code}</span>
                <button onClick={copyCode} className="btn-brand px-3 py-1.5 rounded-lg text-[12px] flex items-center gap-1"><Share2 size={13} /> Copy</button>
              </div>
            )}
            <div className="mb-3">
              <label className="font-display font-600 text-[13px] text-ink-2 mb-1.5 block">Have a code? Redeem it</label>
              <input className="rm-input uppercase" placeholder="e.g. RK4TZ9PB" value={refCode} onChange={e => setRefCode(e.target.value)} maxLength={8} />
            </div>
            <div className="flex gap-3">
              <button className="btn-outline flex-1 py-3 rounded-xl text-[14px]" onClick={() => setReferSheet(false)}>Close</button>
              <button className="btn-cta flex-1 py-3 rounded-xl text-[14px]" onClick={redeemReferral}>Redeem ₹50</button>
            </div>
          </div>
        </div>
      )}

      {/* Verify ID sheet */}
      {verifySheet && (
        <div className="absolute inset-0 z-40 bg-black/40 flex items-end" onClick={() => setVerifySheet(false)}>
          <div className="w-full bg-surface rounded-t-3xl p-5 view-enter" onClick={e => e.stopPropagation()} style={{ maxHeight: "90%", overflowY: "auto" }}>
            <div className="w-10 h-1 bg-line-2 rounded-full mx-auto mb-4" />
            <div className="flex items-center gap-2 font-display font-700 text-[16px] text-ink mb-1"><FileCheck2 size={17} className="text-brand" /> Verify your ID</div>
            <p className="text-[13px] text-ink-3 mb-4">Upload a clear photo of your government ID. Our team usually approves within 24 hours.</p>

            <label className="font-display font-600 text-[13px] text-ink-2 mb-1.5 block">Document type</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {["driving_license", "aadhaar", "pan", "voter"].map(d => (
                <button key={d} onClick={() => setDocType(d)}
                  className={`rounded-full px-3 py-2 text-[12.5px] font-display font-600 border-2 transition-all capitalize ${docType === d ? "border-brand text-brand bg-brand-50" : "border-line text-ink-3"}`}>
                  {d.replace("_", " ")}
                </button>
              ))}
            </div>

            <label className="font-display font-600 text-[13px] text-ink-2 mb-1.5 block">Photo of document</label>
            <label className="block border-2 border-dashed border-line rounded-2xl p-6 text-center text-ink-3 cursor-pointer hover:border-brand transition-colors mb-1">
              {docImage ? (
                <img src={docImage} alt="Document preview" className="max-h-40 mx-auto rounded-xl" />
              ) : (
                <>
                  <div className="text-4xl mb-2">🪪</div>
                  <div className="text-[13px] font-display font-600 text-ink-2">Tap to upload</div>
                  <div className="text-[11px] mt-0.5">PNG, JPEG or WebP · under 1 MB</div>
                </>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && readDoc(e.target.files[0])} />
            </label>
            {docImage && (
              <button onClick={() => setDocImage("")} className="text-[12px] text-red-500 mb-2 font-display font-600">Remove photo</button>
            )}

            {(verifications || []).filter(v => v.status === "pending").length > 0 && (
              <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2.5 text-[12px] text-amber-700 font-body mb-2">⏳ You already have a pending verification.</div>
            )}

            <div className="flex gap-3 mt-2">
              <button className="btn-outline flex-1 py-3 rounded-xl text-[14px]" onClick={() => setVerifySheet(false)}>Close</button>
              <button className="btn-brand flex-1 py-3 rounded-xl text-[14px]" onClick={submitVerify} disabled={!docImage}>
                Submit for review
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}