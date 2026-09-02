import { createContext, useContext, useState } from 'react'

const Ctx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('rm_user') || 'null')
    } catch {
      return null
    }
  })

  const login = (token, u) => {
    localStorage.setItem('rm_token', token)
    localStorage.setItem('rm_user', JSON.stringify(u))
    setUser(u)
  }

  const updateUser = (u) => {
    localStorage.setItem('rm_user', JSON.stringify(u))
    setUser(u)
  }

  const logout = () => {
    localStorage.removeItem('rm_token')
    localStorage.removeItem('rm_user')
    setUser(null)
  }

  return <Ctx.Provider value={{ user, login, updateUser, logout }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
