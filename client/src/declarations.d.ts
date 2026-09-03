declare module "./api.js" {
  export function getToken(): string | null
  export function api(path: string, opts?: { method?: string; body?: any; signal?: AbortSignal }): Promise<any>
}

declare module "./AuthContext.jsx" {
  import type { ReactNode } from "react"
  export function AuthProvider({ children }: { children: ReactNode }): any
  export function useAuth(): {
    user: any
    login: (token: string, u: any) => void
    updateUser: (u: any) => void
    logout: () => void
  }
}

declare module "./Toast.jsx" {
  import type { ReactNode } from "react"
  export function ToastProvider({ children }: { children: ReactNode }): any
  export function useToast(): (text: string, type?: "ok" | "bad") => void
}

declare module "./NotificationsContext.jsx" {
  import type { ReactNode } from "react"
  export function NotificationsProvider({ children }: { children: ReactNode }): any
  export function useNotifications(): {
    items: any[]
    unread: number
    load: (silent?: boolean) => Promise<void>
    markRead: (ids?: number[]) => Promise<void>
  }
}
