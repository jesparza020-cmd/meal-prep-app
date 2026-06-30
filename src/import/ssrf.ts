// Blocks hostnames that resolve to local/private/internal network targets,
// to prevent the recipe-import URL fetcher from being used for SSRF.
export function isBlockedHost(hostname: string): boolean {
  let host = hostname.trim().toLowerCase()
  if (host.startsWith('[') && host.endsWith(']')) {
    host = host.slice(1, -1)
  }

  if (host === '') return true
  if (host === 'localhost') return true
  if (host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) return true

  // IPv4 loopback, unspecified, and private ranges
  if (/^127\./.test(host)) return true
  if (host === '0.0.0.0') return true
  if (/^10\./.test(host)) return true
  if (/^192\.168\./.test(host)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true
  // IPv4 link-local (covers cloud metadata 169.254.169.254)
  if (/^169\.254\./.test(host)) return true

  // IPv6 loopback and unspecified
  if (host === '::1' || host === '::') return true
  // IPv6 link-local
  if (host.startsWith('fe8') || host.startsWith('fe9') || host.startsWith('fea') || host.startsWith('feb')) return true
  // IPv6 unique-local (fc00::/7)
  if (host.startsWith('fc') || host.startsWith('fd')) return true

  return false
}
