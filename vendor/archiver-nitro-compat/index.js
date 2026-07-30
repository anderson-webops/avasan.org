import { Archiver, JsonArchive, TarArchive, ZipArchive } from 'archiver-modern'

const formats = new Map([
  ['json', JsonArchive],
  ['tar', TarArchive],
  ['zip', ZipArchive],
])

function create(format, options) {
  const Archive = formats.get(format)
  if (!Archive)
    throw new Error(`create(${format}): format not registered`)

  return new Archive(options)
}

function archiver(format, options) {
  return create(format, options)
}

archiver.create = create
archiver.isRegisteredFormat = format => formats.has(format)
archiver.registerFormat = (format, Archive) => {
  if (formats.has(format))
    throw new Error(`register(${format}): format already registered`)
  if (typeof Archive !== 'function')
    throw new TypeError(`register(${format}): format module invalid`)

  formats.set(format, Archive)
}

export { Archiver, JsonArchive, TarArchive, ZipArchive }

export default archiver
