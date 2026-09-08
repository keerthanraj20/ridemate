import { useState } from "react"
import { Check, MapPin, Info, Zap, Calculator, RefreshCw } from "lucide-react"
import { api } from "../api.js"
import { useToast } from "../Toast.jsx"
import { SharedMapPicker } from "../components/MapPicker.tsx"
import type { View } from "../types.ts"

const VEHICLE_KM_COST: Record<string, number> = { bike: 1.2, car: 2.5, auto: 2.2, van: 3.2, other: 2.0 }

function RideField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="font-display font-600 text-[13px] text-ink-2">{label}</label>
      {children}
    </div>
  )
}

export function OfferRideView({ onDone }: { onDone: (v: View) => void }) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    from: "", fromLat: null as number | null, fromLng: null as number | null,
    to: "", toLat: null as number | null, toLng: null as number | null,
    date: "", time: "", seats: "3",
    vehicle: "", vehicleType: "car", price: "", notes: "",
  })
  // round trip
  const [returnTrip, setReturnTrip] = useState(false)
  const [returnDate, setReturnDate] = useState("")
  const [returnTime, setReturnTime] = useState("")
  // fare calculator
  const [showCalc, setShowCalc] = useState(false)
  const [calcKm, setCalcKm] = useState("")
  const [calcCost, setCalcCost] = useState<number>(VEHICLE_KM_COST.car)
  const [saving, setSaving] = useState(false)
  const totalSteps = 3
  const toast = useToast()

  const useCalcPrice = () => {
    const km = Number(calcKm)
    const seats = Number(form.seats) || 1
    if (!km || km <= 0) { toast("Enter the one-way distance in km", "bad"); return }
    const perSeat = Math.ceil((km * calcCost) / seats)
    setForm(f => ({ ...f, price: String(perSeat) }))
    toast(`Suggested fare: ₹${perSeat} per seat`)
  }

  const publish = async () => {
    if (!form.from || !form.to || !form.date || !form.time || !form.vehicle || !form.price) {
      toast("Please fill all the details", "bad")
      return
    }
    const departAt = new Date(`${form.date}T${form.time}:00`)
    if (Number.isNaN(departAt.getTime())) {
      toast("Pick a valid date & time", "bad")
      return
    }
    let returnISO: string | undefined
    if (returnTrip && returnDate && returnTime) {
      const ret = new Date(`${returnDate}T${returnTime}:00`)
      if (Number.isNaN(ret.getTime())) { toast("Pick a valid return date & time", "bad"); return }
      if (ret.getTime() <= Date.now()) { toast("Return leg must be in the future", "bad"); return }
      returnISO = ret.toISOString()
    }
    setSaving(true)
    try {
      await api("/rides", {
        method: "POST",
        body: {
          vehicle_type: form.vehicleType,
          vehicle_model: form.vehicle,
          from_name: form.from,
          from_lat: form.fromLat ?? 12.9716,
          from_lng: form.fromLng ?? 77.5946,
          to_name: form.to,
          to_lat: form.toLat ?? 13.0827,
          to_lng: form.toLng ?? 80.2707,
          depart_at: departAt.toISOString(),
          seats_total: Number(form.seats) || 1,
          price: Number(form.price) || 0,
          notes: form.notes,
          repeat_every: "none",
          return_depart_at: returnISO,
        },
      })
      toast(returnISO ? "Ride + return leg published! 🎉" : "Ride published! 🎉")
      setForm({ from: "", fromLat: null, fromLng: null, to: "", toLat: null, toLng: null, date: "", time: "", seats: "3", vehicle: "", vehicleType: "car", price: "", notes: "" })
      setReturnTrip(false); setReturnDate(""); setReturnTime("")
      setStep(1)
      onDone("rides")
    } catch (err: any) {
      toast(err.message || "Couldn't publish ride", "bad")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide">
      <div className="px-4 py-4 bg-surface border-b border-line/60 flex-shrink-0">
        <div className="flex items-center gap-2 mb-1">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`flex items-center justify-center w-7 h-7 rounded-full text-[12px] font-display font-700 transition-all
                ${i + 1 < step ? "bg-brand text-white" :
                  i + 1 === step ? "bg-brand text-white ring-4 ring-brand-light" :
                  "bg-stone-100 text-ink-3"}`}
              >
                {i + 1 < step ? <Check size={14} /> : i + 1}
              </div>
              {i < totalSteps - 1 && (
                <div className={`flex-1 h-px w-8 transition-all ${i + 1 < step ? "bg-brand" : "bg-line"}`} />
              )}
            </div>
          ))}
          <span className="ml-auto text-[12px] text-ink-3 font-body">Step {step} of {totalSteps}</span>
        </div>
        <div className="font-display font-700 text-[15px] text-ink mt-2">
          {step === 1 ? "Route & Schedule" : step === 2 ? "Vehicle & Pricing" : "Review & Publish"}
        </div>
      </div>

      <div className="px-4 py-5 space-y-4">
        {step === 1 && (
          <>
            <SharedMapPicker
              from={{ name: form.from, lat: form.fromLat, lng: form.fromLng }}
              setFrom={v => setForm(f => ({ ...f, from: v.name, fromLat: v.lat, fromLng: v.lng }))}
              to={{ name: form.to, lat: form.toLat, lng: form.toLng }}
              setTo={v => setForm(f => ({ ...f, to: v.name, toLat: v.lat, toLng: v.lng }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <RideField label="Date">
                <input type="date" className="rm-input" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </RideField>
              <RideField label="Departure time">
                <input type="time" className="rm-input" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} />
              </RideField>
            </div>
            <RideField label="Seats available">
              <select className="rm-input" value={form.seats} onChange={e => setForm(f => ({ ...f, seats: e.target.value }))}>
                {["1", "2", "3", "4", "5", "6", "7", "8"].map(n => <option key={n} value={n}>{n} seat{n !== "1" ? "s" : ""}</option>)}
              </select>
            </RideField>

            <div className="flex items-center justify-between bg-surface rounded-xl border border-line p-3.5">
              <div>
                <div className="font-display font-600 text-[14px] text-ink">Round trip</div>
                <div className="text-[12px] text-ink-3">Also share the ride back</div>
              </div>
              <button
                onClick={() => setReturnTrip(v => !v)}
                role="switch"
                aria-checked={returnTrip}
                className={`w-12 h-7 rounded-full transition-colors relative ${returnTrip ? "bg-brand" : "bg-stone-200"}`}
              >
                <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${returnTrip ? "left-6" : "left-1"}`} />
              </button>
            </div>

            {returnTrip && (
              <div className="view-enter space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <RideField label="Return date">
                    <input type="date" className="rm-input" min={form.date} value={returnDate} onChange={e => setReturnDate(e.target.value)} />
                  </RideField>
                  <RideField label="Return time">
                    <input type="time" className="rm-input" value={returnTime} onChange={e => setReturnTime(e.target.value)} />
                  </RideField>
                </div>
                <p className="text-[11px] text-ink-3 flex items-center gap-1"><Info size={12} /> A separate return ride ({form.to || "drop"} → {form.from || "pickup"}) will be created automatically.</p>
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <RideField label="Vehicle type">
              <select className="rm-input" value={form.vehicleType} onChange={e => {
                const v = e.target.value
                setForm(f => ({ ...f, vehicleType: v }))
                setCalcCost(VEHICLE_KM_COST[v] || 2.0)
              }}>
                {[["car", "🚗 Car"], ["bike", "🏍️ Bike"], ["auto", "🛺 Auto"], ["van", "🚐 Van"], ["other", "🚙 Other"]].map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </RideField>
            <RideField label="Vehicle details">
              <input className="rm-input" placeholder="e.g. Honda City, White, 2022" value={form.vehicle}
                onChange={e => setForm(f => ({ ...f, vehicle: e.target.value }))}
              />
            </RideField>
            <RideField label="Price per seat (₹)">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 font-body">₹</span>
                <input className="rm-input pl-7" type="number" placeholder="380" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
              </div>
            </RideField>

            <button
              onClick={() => setShowCalc(v => !v)}
              className="w-full flex items-center justify-between bg-brand-50 border border-brand/20 rounded-xl px-4 py-3 text-left"
            >
              <span className="flex items-center gap-2 font-display font-600 text-[13px] text-brand"><Calculator size={16} /> Fare calculator</span>
              <span className={`text-[12px] text-ink-3 transition-transform ${showCalc ? "rotate-180" : ""}`}>▾</span>
            </button>

            {showCalc && (
              <div className="view-enter bg-stone-50 rounded-2xl p-4 border border-line/60 space-y-2.5">
                <p className="text-[12px] text-ink-3 font-body">Estimate a fair per-seat price based on distance, fuel cost and seats — no driver fees, ever.</p>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] text-ink-3 font-display font-600 block mb-1">One-way distance (km)</label>
                    <input type="number" min="1" className="rm-input text-[13px]" placeholder="e.g. 300" value={calcKm} onChange={e => setCalcKm(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-[11px] text-ink-3 font-display font-600 block mb-1">Running cost ₹/km</label>
                    <select className="rm-input text-[13px]" value={String(calcCost)} onChange={e => setCalcCost(Number(e.target.value))}>
                      <option value="1.2">Bike · 1.2</option>
                      <option value="2.5">Car · 2.5</option>
                      <option value="2.2">Auto · 2.2</option>
                      <option value="3.2">Van · 3.2</option>
                      <option value="2.0">Other · 2.0</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-2 justify-between bg-white rounded-xl px-3 py-2.5">
                  <span className="text-[12px] text-ink-2 font-display font-600">
                    {calcKm && Number(calcKm) > 0 ? (
                      <>≈ <b className="text-brand">₹{Math.ceil((Number(calcKm) * calcCost) / (Number(form.seats) || 1))}</b> / seat · {Number(form.seats) || 1} seats</>
                    ) : "Enter distance to see the split"}
                  </span>
                  <button onClick={useCalcPrice} className="btn-brand px-3 py-1.5 rounded-lg text-[12px] flex items-center gap-1"><RefreshCw size={12} /> Use</button>
                </div>
              </div>
            )}
            <RideField label="Notes for co-travelers (optional)">
              <textarea
                className="rm-input resize-none"
                rows={3}
                placeholder="e.g. Music on, dhaba stop at Channarayapatna…"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </RideField>
          </>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-surface rounded-2xl p-4" style={{ boxShadow: "var(--shadow-card)" }}>
              <div className="font-display font-700 text-[14px] text-ink mb-3">Route Summary</div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2.5 h-2.5 rounded-full bg-brand flex-shrink-0" />
                <span className="font-display font-700 text-[15px] text-ink">{form.from || "—"}</span>
              </div>
              <div className="ml-1.5 border-l-2 border-dashed border-line pl-3 py-1 text-[12px] text-ink-3">
                {form.date} · {form.time}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <MapPin size={13} className="text-cta flex-shrink-0" />
                <span className="font-display font-700 text-[15px] text-ink">{form.to || "—"}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Seats", value: form.seats || "—" },
                { label: "Price/seat", value: form.price ? `₹${form.price}` : "—" },
                { label: "Vehicle", value: form.vehicle?.split(",")[0] || "—" },
              ].map(d => (
                <div key={d.label} className="bg-surface rounded-xl p-3 text-center" style={{ boxShadow: "var(--shadow-card)" }}>
                  <div className="font-display font-700 text-[15px] text-ink">{d.value}</div>
                  <div className="text-[11px] text-ink-3">{d.label}</div>
                </div>
              ))}
            </div>

            <div className="bg-brand-50 border border-brand-light rounded-xl p-3 flex items-start gap-2">
              <Info size={15} className="text-brand flex-shrink-0 mt-0.5" />
              <p className="text-[12px] text-brand-dark leading-relaxed">
                Your ride will be visible to verified travelers after publishing. You can edit or cancel anytime from My Rides.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 bg-surface border-t border-line px-4 py-4 flex gap-3">
        {step > 1 && (
          <button className="btn-outline flex-1 py-3.5 rounded-xl text-[14px]" onClick={() => setStep(s => s - 1)}>
            Back
          </button>
        )}
        {step < totalSteps ? (
          <button className="btn-brand flex-1 py-3.5 rounded-xl text-[14px]" onClick={() => setStep(s => s + 1)}>
            Continue →
          </button>
        ) : (
          <button
            className="btn-cta flex-1 py-3.5 rounded-xl text-[14px] flex items-center justify-center gap-2"
            onClick={publish}
            disabled={saving}
          >
            <Zap size={16} /> {saving ? "Publishing…" : "Publish Ride"}
          </button>
        )}
      </div>
    </div>
  )
}