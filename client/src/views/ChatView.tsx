import { useState, useRef, useEffect, useCallback } from "react"
import { ArrowLeft, MoreHorizontal, Send } from "lucide-react"
import { api } from "../api.js"
import { useToast } from "../Toast.jsx"
import { useAuth } from "../AuthContext.jsx"
import { onWsEvent } from "../ws.js"
import { AvatarCircle } from "../components/ui.tsx"
import type { Conversation, ChatMsg } from "../types.ts"

export function ChatView({ convo, onBack }: { convo: Conversation; onBack: () => void }) {
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const toast = useToast()
  const { user } = useAuth()
  const meId = user?.id

  const load = useCallback(async () => {
    try {
      const data = await api(`/rides/${convo.rideId}/messages`)
      const list = (data.messages || []).map((m: any) => ({
        from: m.sender_id === meId ? "me" as const : "them" as const,
        text: m.body,
      }))
      setMessages(list)
      await api(`/rides/${convo.rideId}/messages/read`, { method: "POST", body: {} }).catch(() => null)
    } catch (err: any) {
      toast(err.message || "Couldn't load messages", "bad")
    } finally {
      setLoading(false)
    }
  }, [convo.rideId, meId, toast])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  // Live delivery: re-fetch the thread when a new message event arrives for
  // this ride from the other party. Own sends are applied optimistically.
  useEffect(() => {
    return onWsEvent((data: any) => {
      if (data.event === "message" && Number(data.rideId) === convo.rideId) {
        load()
      }
    })
  }, [convo.rideId, load])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const send = async () => {
    if (!input.trim()) return
    const text = input.trim()
    setInput("")
    setMessages(m => [...m, { from: "me", text }])
    try {
      const data = await api(`/rides/${convo.rideId}/messages`, { method: "POST", body: { body: text } })
      const msg = data.message
      if (msg) {
        setMessages(m => {
          const arr = m.filter(x => !(x.text === text && x.from === "me" && x === m[m.length - 1]))
          return [...arr, { from: "me" as const, text: msg.body }]
        })
      }
    } catch (err: any) {
      toast(err.message || "Couldn't send", "bad")
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="bg-surface border-b border-line/60 px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <button onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-stone-100 transition-colors">
          <ArrowLeft size={20} className="text-ink-2" />
        </button>
        <AvatarCircle initial={convo.initial} color={convo.color} size={38} />
        <div className="flex-1 min-w-0">
          <div className="font-display font-700 text-[14px] text-ink">{convo.name}</div>
          <div className="text-[12px] text-brand">{convo.route}</div>
        </div>
        <button className="text-ink-3 hover:text-ink" aria-label="More">
          <MoreHorizontal size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-4 space-y-3">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map(i => <div key={i} className="shimmer rounded-full" style={{ height: 40, width: i % 2 ? "60%" : "45%" }} />)}
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">👋</div>
            <div className="font-display font-700 text-ink text-lg mb-1">Say hello to {convo.name}</div>
            <p className="text-ink-3 text-sm">Coordinate the pickup spot and any other details here.</p>
          </div>
        ) : messages.map((m, i) => (
          <div key={i} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[78%] px-4 py-2.5 text-[14px] leading-relaxed
                ${m.from === "me" ? "bubble-out text-white" : "bubble-in text-ink"}`}
            >
              {m.text}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="bg-surface border-t border-line/60 px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <input
          className="rm-input flex-1"
          placeholder="Type a message…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
        />
        <button
          onClick={send}
          className="w-10 h-10 rounded-xl btn-brand flex items-center justify-center flex-shrink-0"
          disabled={!input.trim()}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}