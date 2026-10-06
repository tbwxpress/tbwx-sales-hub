'use client'

import { useSyncExternalStore } from 'react'

/**
 * The app's theme lives as a `dark` / `light` class on <html> (set before
 * paint by the inline script in layout.tsx, flipped by ThemeToggle). This hook
 * follows that class. Returns null during SSR / hydration.
 */
function subscribe(onChange: () => void) {
  const obs = new MutationObserver(onChange)
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => obs.disconnect()
}

const read = (): 'dark' | 'light' =>
  document.documentElement.classList.contains('light') ? 'light' : 'dark'

export function useHtmlTheme(): 'dark' | 'light' | null {
  return useSyncExternalStore(subscribe, read, () => null)
}
