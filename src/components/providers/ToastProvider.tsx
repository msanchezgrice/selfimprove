'use client'

import { Toaster } from 'sonner'

/**
 * Mounts the sonner Toaster at the root level.
 * Place this inside the root layout so toasts are available on every page.
 */
export function ToastProvider() {
  return (
    <Toaster
      position="bottom-right"
      duration={4000}
      richColors
      closeButton
    />
  )
}
