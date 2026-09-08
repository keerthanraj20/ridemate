import type { ReactNode } from "react"

export type NotificationItem = {
  id: number
  body: string
  read: number
  created_at: string
  [key: string]: any
}

export type NotificationsCtxValue = {
  items: NotificationItem[]
  unread: number
  load: (silent?: boolean) => Promise<void>
  markRead: (ids: number[]) => Promise<void>
}

export declare function NotificationsProvider(props: { children: ReactNode }): React.JSX.Element

export declare const useNotifications: () => NotificationsCtxValue