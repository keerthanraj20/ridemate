import { useState, useEffect } from "react"
import { api } from "../api.js"
import { humanDate } from "../lib.ts"
import { Badge } from "../components/ui.tsx"

export function HistoryView() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let on = true
    ;(async () => {
      try {
        const h = await api("/rides/history")
        if (!on) return
        setItems([...(h.joined || []), ...(h.offered || [])])
      } catch { /* ignore */ } finally {
        if (on) setLoading(false)
      }
    })()
    return () => { on = false }
  }, [])

  const completed = items.filter(i => i.status === "completed")
  const total = completed.reduce((s, x) => s + (x.price || 0), 0)
  const avg = completed.length ? (completed.reduce((s, x) => s + (x.owner_rating || 0), 0) / completed.length).toFixed(1) : "—"

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide">
      <div className="px-4 pt-3 pb-4">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total rides", value: String(items.length), icon: "🛣️" },
            { label: "Spent (est.)", value: `₹${total}`, icon: "💰" },
            { label: "Avg rating", value: `${avg} ⭐`, icon: "🏆" },
          ].map(s => (
            <div key={s.label} className="bg-surface rounded-2xl p-3 text-center" style={{ boxShadow: "var(--shadow-card)" }}>
              <div className="text-xl mb-1">{s.icon}</div>
              <div className="font-display font-800 text-[16px] text-ink">{s.value}</div>
              <div className="text-[10px] text-ink-3">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 pb-8 space-y-3">
        {loading ? (
          [0, 1].map(i => <div key={i} className="rounded-2xl shimmer" style={{ height: 110 }} />)
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">📒</div>
            <div className="font-display font-700 text-ink text-lg mb-1">No history yet</div>
            <p className="text-ink-3 text-sm">Your completed and past rides will show up here.</p>
          </div>
        ) : items.map(h => (
          <div key={h.id} className="bg-surface rounded-2xl p-4" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="font-display font-700 text-[14px] text-ink">{h.from_name} → {h.to_name}</div>
                <div className="text-[12px] text-ink-3 mt-0.5">{humanDate(h.depart_at)} · {h.owner_name}</div>
              </div>
              <Badge variant={h.status === "completed" ? "success" : "muted"}>{h.status}</Badge>
            </div>
            <div className="flex items-center justify-between border-t border-line pt-2 mt-2">
              <span className="text-[12px] text-ink-3">{h.myRating ? "Rated" : "Not rated"}</span>
              <span className="font-display font-700 text-ink">₹{h.price}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}