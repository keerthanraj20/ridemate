// ─── Shared UI types ──────────────────────────────────────────────────────────

export type View =
  | "home" | "find" | "offer" | "rides" | "messages"
  | "saved" | "history" | "auth" | "profile" | "chat" | "payments"
  | "detail" | "admin"

export type Ride = {
  id: number
  ownerName: string
  ownerInitial: string
  ownerColor: string
  rating: number
  trips?: number
  verified: boolean
  ladiesOnly?: boolean
  from: string
  fromSub?: string
  to: string
  toSub?: string
  date: string
  time: string
  leaveIn?: string
  vehicleEmoji: string
  vehicleModel: string
  vehicleColor?: string
  seats: number
  price: number
  desc?: string
  vehicle_type: string
  depart_at: string
  my_status?: string | null
  owner_ts?: string
}

export type Place = { name: string; lat: number | null; lng: number | null }

export type Conversation = {
  rideId: number
  name: string
  initial: string
  color: string
  route: string
  time: string
  unread: number
  lastMsg: string
  counterpartId?: number
}

export type ChatMsg = { from: "me" | "them"; text: string; ts?: string }