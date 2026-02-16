import { ref } from 'vue'

/**
 * Composable for confirm/alert modals to replace browser confirm() and alert().
 */
export function useConfirm() {
  const show = ref(false)
  const title = ref('')
  const message = ref('')
  const isDanger = ref(false)
  const confirmLabel = ref('Confirmer')

  let resolvePromise: ((value: boolean) => void) | null = null

  function ask(opts: {
    title: string
    message: string
    confirmLabel?: string
    danger?: boolean
  }): Promise<boolean> {
    title.value = opts.title
    message.value = opts.message
    confirmLabel.value = opts.confirmLabel ?? 'Confirmer'
    isDanger.value = opts.danger ?? false
    show.value = true

    return new Promise((resolve) => {
      resolvePromise = resolve
    })
  }

  function onConfirm() {
    show.value = false
    resolvePromise?.(true)
    resolvePromise = null
  }

  function onCancel() {
    show.value = false
    resolvePromise?.(false)
    resolvePromise = null
  }

  return {
    show,
    title,
    message,
    isDanger,
    confirmLabel,
    ask,
    onConfirm,
    onCancel,
  }
}
