import { cookies } from 'next/headers'

const KEY = 'pt-nav-collapsed'

/** Server-side read of the user's sidebar-collapsed preference. Used by
 * server entry points (Shell, layouts, loading skeletons) to render the
 * correct .pt-root className during SSR — no client-side flash. Defaults
 * to collapsed (true) for first-visit users, matching the historical
 * useState(true) default. */
export async function getNavCollapsed(): Promise<boolean> {
  const c = await cookies()
  return c.get(KEY)?.value !== '0'
}

/** The className the .pt-root element should render with, given the
 * server-read collapse state. Pass extra classes (e.g. 'no-right',
 * 'is-inbox') after. */
export function rootClassName(collapsed: boolean, extra = ''): string {
  return `pt-root${collapsed ? ' pt-nav-collapsed' : ''}${extra ? ' ' + extra : ''}`
}
