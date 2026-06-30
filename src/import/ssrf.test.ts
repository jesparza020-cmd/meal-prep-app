import { describe, it, expect } from 'vitest'
import { isBlockedHost } from './ssrf'

describe('isBlockedHost', () => {
  const blocked = [
    'localhost',
    'sub.localhost',
    '127.0.0.1',
    '127.5.5.5',
    '0.0.0.0',
    '10.0.0.1',
    '192.168.1.1',
    '172.16.0.1',
    '172.31.255.1',
    '169.254.169.254',
    '::1',
    '[::1]',
    'fe80::1',
    'fd00::1',
    'host.internal',
    'printer.local',
    '',
  ]

  for (const host of blocked) {
    it(`blocks ${JSON.stringify(host)}`, () => {
      expect(isBlockedHost(host)).toBe(true)
    })
  }

  const allowed = [
    'example.com',
    'www.allrecipes.com',
    '8.8.8.8',
    '1.2.3.4',
    '172.32.0.1',
    '172.15.0.1',
    'recipes.co.uk',
  ]

  for (const host of allowed) {
    it(`allows ${JSON.stringify(host)}`, () => {
      expect(isBlockedHost(host)).toBe(false)
    })
  }
})
