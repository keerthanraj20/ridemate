import { useState, useEffect, useCallback } from "react"
import { Search } from "lucide-react"
import { api } from "../api.js"
import { initials, hashColor, relativeTime } from "../lib.ts"
import { onWsEvent } from "../ws.js"
import { AvatarCircle } from "../components/ui.tsx"
import type { Conversation } from "../types.ts"

export function MessagesView({ onSelectChat }: { onSelectChat: (c: Conversation) => void }) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")

  const load = useCallback(async () => {
    try {
      const data = await api("/messages")
      const list = (data.conversations || []).map((c: any) => {
        const name = c.counterpart?.name || "Traveler"
        return {
          rideId: c.ride.id,
          name,
          initial: initials(name),
          color: hashColor(name),
          route: `${c.ride.from_name} → ${c.ride.to_name}`,
          time: relativeTime(c.lastAt),
          unread: c.unread || 0,
          lastMsg: c.lastMessage || "No messages yet",
          counterpartId: c.counterpart?.id,
        }
      })
      setConversations(list)
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Live refresh: a new incoming message should surface immediately,
  // reordering the list by recency + unread badge.
  useEffect(() => {
    return onWsEvent((data: any) => {
      if (data.event === "message") load()
    })
  }, [load])

  const filtered = conversations.filter(c =>
    !query || c.name.toLowerCase().includes(query.toLowerCase()) || c.route.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide">
      <div className="px-4 pt-3 pb-2">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input className="rm-input pl-9 text-[14px]" placeholder="Search conversations…" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
      </div>
      <div className="divide-y divide-line/60">
        {loading ? (
          <div className="px-4 py-4 space-y-3">
            {[0, 1, 2].map(i => <div key={i} className="rounded-2xl shimmer" style={{ height: 64 }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">💬</div>
            <div className="font-display font-700 text-ink text-lg mb-1">No conversations yet</div>
            <p className="text-ink-3 text-sm">Once your seat is confirmed on a ride, you can chat here.</p>
          </div>
        ) : filtered.map(msg => (
          <button
            key={msg.rideId}
            onClick={() => onSelectChat(msg)}
            className="w-full flex items-start gap-3 px-4 py-4 hover:bg-stone-50 transition-colors text-left"
          >
            <AvatarCircle initial={msg.initial} color={msg.color} size={46} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <span className="font-display font-700 text-[14px] text-ink">{msg.name}</span>
                <span className="text-[11px] text-ink-3">{msg.time}</span>
              </div>
              <div className="text-[12px] text-brand font-body mb-1">{msg.route}</div>
              <div className={`text-[13px] truncate ${msg.unread > 0 ? "text-ink font-600" : "text-ink-3"}`}>
                {msg.lastMsg}
              </div>
            </div>
            {msg.unread > 0 && (
              <div className="w-5 h-5 rounded-full bg-brand flex items-center justify-center text-[11px] font-display font-700 text-white flex-shrink-0 mt-1">
                {msg.unread}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}