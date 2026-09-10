import { useState, useEffect, useCallback } from "react"
import { api } from "../api.js"
import { useToast } from "../Toast.jsx"
import { useAuth } from "../AuthContext.jsx"
import { humanDate } from "../lib.ts"
import { Badge } from "../components/ui.tsx"
import type { View } from "../types.ts"

type EscrowItem = {
  id: number
  ride_id: number
  request_id: number
  role: "payer" | "payee"
  status: string
  amount: number
  provider: string
  created_at: string
  captured_at: string | null
  released_at: string | null
  refunded_at: string | null
  counterpart: { name: string }
  ride: { from_name: string; to_name: string; depart_at: string; status: string }
}

type RazorpayOrder = { keyId: string; orderId: string } | null

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void }
  }
}

const STATUS_VARIANT: Record<string, "muted" | "pending" | "success" | "danger" | "brand"> = {
  created:  "pending",
  captured: "brand",
  released: "success",
  refunded: "muted",
  cancelled: "muted",
}

// Dynamically load Razorpay's checkout.js (cached after first load)
function loadRazorpayCheckout(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true)
    const s = document.createElement("script")
    s.src = "https://checkout.razorpay.com/v1/checkout.js"
    s.async = true
    s.onload = () => resolve(Boolean(window.Razorpay))
    s.onerror = () => resolve(false)
    document.head.appendChild(s)
  })
}

export function PaymentView({ onNavigate }: { onNavigate: (v: View) => void }) {
  const [items, setItems] = useState<EscrowItem[]>([])
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState<number | null>(null)
  const { user, updateUser } = useAuth()
  const toast = useToast()

  const load = useCallback(async () => {
    try {
      const data = await api("/payments")
      setItems(data.payments || [])
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const pay = async (requestId: number) => {
    setPaying(requestId)
    try {
      const data = await api("/payments/order", { method: "POST", body: { request_id: requestId } })

      // Mock provider: order is "captured" immediately, nothing else to do.
      if (!data.razorpay) {
        toast("Fare held in escrow")
        load()
        return
      }

      // Live Razorpay: open the checkout modal for the created order.
      const loaded = await loadRazorpayCheckout()
      if (!loaded) {
        toast("Could not load the payment page — try again", "bad")
        return
      }

      const rzp = new window.Razorpay!({
        key: data.razorpay.keyId,
        order_id: data.razorpay.orderId,
        name: "SaathYaan",
        description: "Ride fare — held safely until the trip is done",
        currency: "INR",
        theme: { color: "#0d9488" },
        modal: { ondismiss: () => setPaying(null) },
        handler: async (resp: { razorpay_payment_id: string }) => {
          try {
            await api("/payments/order/verify", {
              method: "POST",
              body: { order_id: data.razorpay.orderId, payment_id: resp.razorpay_payment_id },
            })
            toast("Payment confirmed — fare held in escrow 🛡️")
          } catch (err: any) {
            toast(err.message || "Payment received, confirming…", "bad")
          }
          load()
        },
      })
      rzp.open()
    } catch (err: any) {
      toast(err.message || "Payment failed", "bad")
      setPaying(null)
    }
  }

  const release = async (escrowId: number) => {
    try {
      const d = await api(`/payments/${escrowId}/release`, { method: "POST", body: {} })
      toast(d.message || "Funds released to your wallet")
      // Refresh the wallet balance shown in the header
      try {
        const me = await api("/auth/me")
        if (me.user) updateUser(me.user)
      } catch { /* keep cached user */ }
      load()
    } catch (err: any) {
      toast(err.message || "Release failed", "bad")
    }
  }

  const refund = async (escrowId: number) => {
    try {
      const d = await api(`/payments/${escrowId}/refund`, { method: "POST", body: {} })
      toast(d.message || "Refund processed")
      load()
    } catch (err: any) {
      toast(err.message || "Refund failed", "bad")
    }
  }

  const myPays = items.filter(i => i.role === "payer")
  const myReceives = items.filter(i => i.role === "payee")

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide">
      {user?.credit_balance > 0 && (
        <div className="mx-4 mt-3 mb-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-emerald-700 font-display font-600 uppercase tracking-wide">Wallet balance</div>
            <div className="font-display font-800 text-xl text-emerald-800">₹{Number(user?.credit_balance ?? 0).toFixed(2)}</div>
          </div>
          <span className="text-[11px] text-emerald-600">From completed rides</span>
        </div>
      )}

      <div className="px-4 pb-8 space-y-4">
        {loading ? (
          [0, 1].map(i => <div key={i} className="rounded-2xl shimmer" style={{ height: 120 }} />)
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">🛡️</div>
            <div className="font-display font-700 text-ink text-lg mb-1">No payments yet</div>
            <p className="text-ink-3 text-sm mb-4">When you book a seat, the fare is held safely until the trip happens.</p>
            <button className="btn-brand px-6 py-3 rounded-xl text-[14px]" onClick={() => onNavigate("find")}>
              Find a Ride
            </button>
          </div>
        ) : (
          <>
            {myPays.length > 0 && (
              <Section title={`Your holds (${myPays.length})`} />
            )}
            {myPays.map(e => (
              <Card
                key={e.id}
                item={e}
                userId={user?.id}
                paying={paying === e.request_id}
                onPay={() => pay(e.request_id)}
                onRefund={() => refund(e.id)}
                onRelease={() => release(e.id)}
              />
            ))}

            {myReceives.length > 0 && (
              <div className="mt-4">
                <Section title={`Receivables (${myReceives.length})`} />
                {myReceives.map(e => (
                  <Card
                    key={e.id}
                    item={e}
                    userId={user?.id}
                    paying={paying === e.request_id}
                    onPay={() => pay(e.request_id)}
                    onRefund={() => refund(e.id)}
                    onRelease={() => release(e.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Section({ title }: { title: string }) {
  return (
    <div className="pt-2 pb-1">
      <div className="text-[13px] font-display font-700 text-ink-2 uppercase tracking-wide">{title}</div>
    </div>
  )
}

function Card({
  item: e,
  userId,
  paying,
  onPay,
  onRefund,
  onRelease,
}: {
  item: EscrowItem
  userId: number | undefined
  paying: boolean
  onPay: () => void
  onRefund: () => void
  onRelease: () => void
}) {
  const isPayer = e.role === "payer"
  const isRideCompleted = e.ride.status === "completed"
  const isRideCancelled = e.ride.status === "cancelled"

  return (
    <div
      className="bg-surface rounded-2xl p-4 mb-3 card-lift"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Badge variant={STATUS_VARIANT[e.status] || "muted"}>{e.status}</Badge>
            <span className="text-[11px] text-ink-3 font-body">{isPayer ? "Your hold" : "Receivable"}</span>
          </div>
          <div className="font-display font-700 text-[15px] text-ink mt-1">
            {e.ride.from_name} → {e.ride.to_name}
          </div>
          <div className="text-[12px] text-ink-3 mt-0.5">
            {humanDate(e.ride.depart_at)} · {isPayer ? "To " : "From "}{e.counterpart.name}
          </div>
        </div>
        <div className="text-right">
          <div className="font-display font-800 text-xl text-ink">₹{e.amount.toFixed(2)}</div>
          <div className="text-[10px] text-ink-3">{e.role === "payer" ? "you paid" : "owed to you"}</div>
        </div>
      </div>

      <div className="text-[11px] text-ink-3 border-t border-line pt-2 mt-2 mb-2 space-y-0.5">
        {e.captured_at && <div>Payment held · {humanDate(e.captured_at)}</div>}
        {e.released_at && <div>Released to owner · {humanDate(e.released_at)}</div>}
        {e.refunded_at && <div>Refunded · {humanDate(e.refunded_at)}</div>}
        <div>Ride: {e.ride.status}</div>
      </div>

      <div className="flex gap-2">
        {isPayer && e.status === "created" && (
          <button className="btn-brand flex-1 py-2.5 rounded-xl text-[13px]" onClick={onPay} disabled={paying}>
            {paying ? "Opening payment…" : `Pay ₹${e.amount.toFixed(2)}`}
          </button>
        )}
        {isPayer && e.status === "captured" && !isRideCompleted && (
          <button className="btn-outline flex-1 py-2.5 rounded-xl text-[13px] text-danger" onClick={onRefund}>
            Cancel & refund
          </button>
        )}
        {!isPayer && e.status === "captured" && isRideCompleted && (
          <button className="btn-brand flex-1 py-2.5 rounded-xl text-[13px]" onClick={onRelease}>
            Release ₹{e.amount.toFixed(2)} to wallet
          </button>
        )}
        {!isPayer && e.status === "captured" && !isRideCompleted && (
          <div className="flex-1 py-2.5 rounded-xl text-[12px] text-ink-3 text-center border border-line">
            Release after ride completes
          </div>
        )}
      </div>
    </div>
  )
}