import { createContext, useCallback, useContext, useRef, useState } from 'react'

const Ctx = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const push = useCallback((text, type = 'ok') => {
    const id = ++idRef.current
    setToasts((t) => [...t, { id, text, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800)
  }, [])

  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toaster" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`} onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
            <span>{t.type === 'ok' ? '✅' : '⚠️'}</span>
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
