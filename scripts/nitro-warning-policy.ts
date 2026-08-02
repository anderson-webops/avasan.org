const expectedUnusedNames = [
  'H3Error',
  'H3Event',
  'deleteCookie',
  'getCookie',
  'setCookie',
]

function normalizedPath(value: unknown) {
  return typeof value === 'string' ? value.replaceAll('\\', '/') : ''
}

export function isExpectedNitroH3BridgeWarning(warning: unknown) {
  if (!warning || typeof warning !== 'object')
    return false

  const candidate = warning as {
    code?: unknown
    exporter?: unknown
    ids?: unknown
    names?: unknown
  }
  if (candidate.code !== 'UNUSED_EXTERNAL_IMPORT')
    return false
  if (!normalizedPath(candidate.exporter).endsWith(
    '/node_modules/@nuxt/nitro-server/node_modules/h3/dist/index.mjs',
  )) {
    return false
  }
  if (!Array.isArray(candidate.ids) || candidate.ids.length !== 1
    || !normalizedPath(candidate.ids[0]).endsWith(
      '/node_modules/@nuxt/nitro-server/dist/h3.mjs',
    )) {
    return false
  }
  if (!Array.isArray(candidate.names))
    return false
  if (candidate.names.length !== expectedUnusedNames.length
    || !candidate.names.every(name => typeof name === 'string')) {
    return false
  }

  const names = candidate.names.toSorted()
  return names.every((name, index) => name === expectedUnusedNames[index])
}
