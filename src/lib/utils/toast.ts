import { toast } from 'sonner'

type ToastType = 'success' | 'error' | 'info' | 'warning'
type ToastOptions = Parameters<typeof toast.success>[1]

/**
 * Show a global, auto-dismissing toast notification.
 *
 * @param type    - Visual style: 'success' | 'error' | 'info' | 'warning'
 * @param message - The message text to display in the toast
 * @param options - Optional overrides forwarded to sonner (e.g. `id`, `duration`).
 *                  Pass `{ id: 'my-action' }` to prevent duplicate toasts on
 *                  double-click — sonner replaces an existing toast with the
 *                  same id instead of creating a new one.
 *
 * @example
 * showToast('success', 'PRD approved successfully')
 * showToast('error', 'Failed to approve PRD. Please try again.')
 * showToast('info', 'Status updated to In Review', { id: 'status-update' })
 */
export function showToast(type: ToastType, message: string, options?: ToastOptions): void {
  toast[type](message, options)
}
