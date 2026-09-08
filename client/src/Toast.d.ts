import type { ReactNode } from "react"

export type ToastFn = (text: string, type?: "ok" | "bad") => void

export declare function ToastProvider(props: { children: ReactNode }): React.JSX.Element

export declare const useToast: () => ToastFn