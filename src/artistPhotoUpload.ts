import { backend } from './backend'
import type { AdminBand } from './adminApi'
import type { ArtistPhotoData } from './artistPhotoTypes'

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024

// Decode locally and strip embedded metadata. Only this bounded PNG goes to the server.
export async function prepareArtistPhoto(file: File): Promise<Blob> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('PHOTO_FILE_TYPE')
  if (!file.size || file.size > MAX_PHOTO_BYTES) throw new Error('PHOTO_FILE_SIZE')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    try { await image.decode() } catch { throw new Error('PHOTO_FILE_INVALID') }
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 24000000) throw new Error('PHOTO_FILE_DIMENSIONS')
    const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('PHOTO_FILE_INVALID')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob || blob.size > MAX_PHOTO_BYTES) throw new Error('PHOTO_FILE_SIZE')
    return blob
  } finally { URL.revokeObjectURL(url) }
}

export async function saveArtistPhotoFile(band: AdminBand, aliases: string[], photo: ArtistPhotoData, file: File) {
  if (!backend || !band.updated_at) throw new Error('MIGRATION_REQUIRED')
  const prepared = await prepareArtistPhoto(file)
  const body = new FormData()
  body.set('file', prepared, 'photo.png')
  body.set('metadata', JSON.stringify({ bandId: band.id, version: band.updated_at, aliases, photo }))
  const { data, error } = await backend.functions.invoke('artist-photo-upload', { body })
  if (error) {
    let code = ''
    try { code = (await error.context.json()).error } catch { /* Keep the editable form on network failure. */ }
    throw new Error(code || 'PHOTO_UPLOAD_FAILED')
  }
  if (!data?.saved) throw new Error('PHOTO_UPLOAD_FAILED')
}
