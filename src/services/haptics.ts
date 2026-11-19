export type HapticKind = 'tick' | 'confirm';

export function haptic(kind: HapticKind): void {
  const bridge = (window as unknown as { AndroidBridge?: { performHaptic?: (kind: string) => void } })
    .AndroidBridge;
  if (bridge?.performHaptic) {
    bridge.performHaptic(kind);
    return;
  }
  navigator.vibrate?.(kind === 'tick' ? 8 : 16);
}
