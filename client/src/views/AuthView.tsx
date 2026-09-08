import { useState } from "react"
import { Users, Mail, Lock, Phone, Shield } from "lucide-react"
import { api } from "../api.js"
import { useToast } from "../Toast.jsx"
import { useAuth } from "../AuthContext.jsx"

export function AuthView() {
  const [mode, setMode] = useState<"login" | "register">("login")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const { login } = useAuth()
  const toast = useToast()

  const submit = async () => {
    if (!email || !password) { toast("Enter your email and password", "bad"); return }
    if (mode === "register") {
      if (!name || name.trim().length < 2) { toast("Enter your full name", "bad"); return }
    }
    setBusy(true)
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/register"
      const body: any = { email, password }
      if (mode === "register") { body.name = name; body.phone = phone || email.split("@")[0] }
      const data = await api(path, { method: "POST", body })
      login(data.token, data.user)
      toast(mode === "login" ? "Welcome back! 👋" : "Account created! 🎉")
    } catch (err: any) {
      toast(err.message || "Something went wrong", "bad")
    } finally {
      setBusy(false)
    }
  }

  const IconCircle = ({ children }: { children: React.ReactNode }) => (
    <div className="w-10 h-10 rounded-xl bg-white/90 flex items-center justify-center text-[20px] shadow-sm flex-shrink-0">
      {children}
    </div>
  )

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide flex items-center justify-center p-5">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl hero-gradient flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-3xl">🛣️</span>
          </div>
          <h1 className="font-display font-800 text-2xl text-ink">RideMate</h1>
          <p className="text-ink-3 text-[14px] mt-1">India's friendliest carpool community</p>
        </div>

        <div className="bg-surface rounded-3xl p-6 shadow-xl" style={{ boxShadow: "var(--shadow-lifted)" }}>
          <h2 className="font-display font-700 text-[18px] text-ink mb-1">
            {mode === "login" ? "Welcome back 👋" : "Join RideMate"}
          </h2>
          <p className="text-[13px] text-ink-3 mb-5">
            {mode === "login" ? "Log in with your email and password" : "Create your account to start sharing rides"}
          </p>

          {mode === "register" && (
            <div className="mb-3 space-y-1.5">
              <label className="font-display font-600 text-[13px] text-ink-2 block">Full name</label>
              <div className="flex items-center gap-3 bg-canvas border border-line rounded-xl px-3">
                <span className="text-ink-3"><Users size={16} /></span>
                <input className="rm-input !border-0 !bg-transparent !shadow-none" placeholder="Priya Sharma" value={name} onChange={e => setName(e.target.value)} />
              </div>
            </div>
          )}

          <div className="mb-3 space-y-1.5">
            <label className="font-display font-600 text-[13px] text-ink-2 block">Email</label>
            <div className="flex items-center gap-3 bg-canvas border border-line rounded-xl px-3">
              <Mail size={16} className="text-ink-3 flex-shrink-0" />
              <input className="rm-input !border-0 !bg-transparent !shadow-none" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
          </div>

          {mode === "register" && (
            <div className="mb-3 space-y-1.5">
              <label className="font-display font-600 text-[13px] text-ink-2 block">Phone (optional)</label>
              <div className="flex items-center gap-3 bg-canvas border border-line rounded-xl px-3">
                <Phone size={16} className="text-ink-3 flex-shrink-0" />
                <input className="rm-input !border-0 !bg-transparent !shadow-none" type="tel" placeholder="98765 43210" value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
            </div>
          )}

          <div className="mb-4 space-y-1.5">
            <label className="font-display font-600 text-[13px] text-ink-2 block">Password</label>
            <div className="flex items-center gap-3 bg-canvas border border-line rounded-xl px-3">
              <Lock size={16} className="text-ink-3 flex-shrink-0" />
              <input className="rm-input !border-0 !bg-transparent !shadow-none" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} />
            </div>
            {mode === "register" && (
              <p className="text-[11px] text-ink-3">Min 8 characters with both letters & numbers.</p>
            )}
          </div>

          <button
            className="btn-brand w-full py-3.5 rounded-xl text-[15px] mb-3"
            onClick={submit}
            disabled={busy}
          >
            {busy ? "Please wait…" : mode === "login" ? "Log in →" : "Create account →"}
          </button>

          <div className="text-center text-[13px] text-ink-3 mt-4">
            {mode === "login" ? "New to RideMate? " : "Already have an account? "}
            <button
              onClick={() => setMode(m => m === "login" ? "register" : "login")}
              className="text-brand font-display font-600"
            >
              {mode === "login" ? "Sign up" : "Log in"}
            </button>
          </div>
        </div>

        <p className="text-center text-[12px] text-ink-3 mt-5 flex items-center justify-center gap-1.5">
          <Shield size={13} className="text-brand" /> Trusted community · Fair cost splitting
        </p>
      </div>
    </div>
  )
}