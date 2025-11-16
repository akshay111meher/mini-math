export interface WorkflowGlobalState {
  getGlobalState<T = unknown>(): T | undefined
  setGlobalState<T>(value: T): void
  updateGlobalState<T = unknown>(updater: (prev: Readonly<T | undefined>) => T): void
  updatePartialState<P extends Record<string, unknown>>(
    patch: Readonly<P>,
    opts?: { deep?: boolean },
  ): void
  getSecret(secretIdentifier: string): string | undefined
}
