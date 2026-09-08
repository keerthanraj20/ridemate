import type { ReactNode } from "react"

export type User = {
  id?: number
  name?: string
  email?: string
  phone?: string
  bio?: string
  avatar?: string
  [key: string]: any
}

export type AuthCtxValue = {
  user: User | null
  login: (token: string, u: User) => void
  updateUser: (u: User) => void
  logout: () => void
}

export declare function AuthProvider(props: { children: ReactNode }): React.JSX.Element

export declare const useAuth: () => AuthCtxValue