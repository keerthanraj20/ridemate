import { useState, useEffect, useCallback } from "react"
import { Heart, Plus } from "lucide-react"
import { api } from "../api.js"
import { useToast } from "../Toast.jsx"
import type { View } from "../types.ts"

export function SavedView({ onNavigate, onUnsaved }: { onNavigate: (v: View) => void; onUnsaved: () => void }) {
  const [routes, setRoutes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const toast = useToast()

  const load = useCallback(async () => {
    try {
      const data = await api("/saved-routes")
      setRoutes(data.routes || [])
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const remove = async (id: number) => {
    try {
      await api(`/saved-routes/${id}`, { method: "DELETE" })
      toast("Route removed")
      load()
    } catch (err: any) {
      toast(err.message || "Couldn't remove", "bad")
    }
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide px-4 pt-3 pb-8">
      <div className="space-y-3">
        {loading ? (
          [0, 1].map(i => <div key={i} className="rounded-2xl shimmer" style={{ height: 120 }} />)
        ) : routes.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">🗺️</div>
            <div className="font-display font-700 text-ink text-lg mb-1">No saved routes</div>
            <p className="text-ink-3 text-sm">Save your regular trips here for quick access.</p>
          </div>
        ) : routes.map(r => (
          <div key={r.id} className="bg-surface rounded-2xl p-4 card-lift" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="flex items-start justify-between mb-3">
              <div>
                {r.label ? <div className="text-[12px] text-brand font-display font-600 mb-0.5">{r.label}</div> : null}
                <div className="font-display font-700 text-[16px] text-ink">{r.from_name} → {r.to_name}</div>
              </div>
              <button className="text-ink-3 hover:text-ladies transition-colors" onClick={() => remove(r.id)} aria-label="Remove route">
                <Heart size={18} className="fill-ladies text-ladies" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="btn-brand ml-auto px-4 py-2 rounded-xl text-[13px]"
                onClick={() => onNavigate("find")}
              >
                Find rides
              </button>
            </div>
          </div>
        ))}
        <button
          className="w-full border-2 border-dashed border-line rounded-2xl p-5 text-center text-ink-3 hover:border-brand hover:text-brand transition-colors font-display font-600 text-[14px]"
          onClick={() => { onNavigate("find"); onUnsaved() }}
        >
          <Plus size={20} className="inline mb-1" /> Save a new route
        </button>
      </div>
    </div>
  )
}