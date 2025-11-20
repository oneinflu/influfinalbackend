import { Buffer } from 'node:buffer';

const ZONE = process.env.BUNNY_STORAGE_ZONE;
const ACCESS_KEY = process.env.BUNNY_ACCESS_KEY;
const CDN_BASE = process.env.BUNNY_CDN_BASE_URL;

// Upload a file buffer to Bunny Storage at /{zone}/{userId}/{filename}
export async function uploadToBunny(userId, filename, buffer, contentType = 'application/octet-stream') {
  if (!ZONE || !ACCESS_KEY || !CDN_BASE) {
    throw new Error('Bunny Storage not configured: set BUNNY_STORAGE_ZONE, BUNNY_ACCESS_KEY, BUNNY_CDN_BASE_URL');
  }
  const safeUser = String(userId);
  const safeName = String(filename);
  const endpoint = `https://storage.bunnycdn.com/${ZONE}/${safeUser}/${safeName}`;

  const res = await fetch(endpoint, {
    method: 'PUT',
    headers: {
      'AccessKey': ACCESS_KEY,
      'Content-Type': contentType,
    },
    body: buffer,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Bunny upload failed (${res.status}): ${text || res.statusText}`);
  }
  const url = `${CDN_BASE}/${safeUser}/${safeName}`;
  return url;
}

// Delete a file from Bunny Storage at /{zone}/{userId}/{filename}
export async function deleteFromBunny(userId, filename) {
  if (!ZONE || !ACCESS_KEY) {
    throw new Error('Bunny Storage not configured: set BUNNY_STORAGE_ZONE, BUNNY_ACCESS_KEY');
  }
  const safeUser = String(userId);
  const safeName = String(filename);
  const endpoint = `https://storage.bunnycdn.com/${ZONE}/${safeUser}/${safeName}`;

  const res = await fetch(endpoint, {
    method: 'DELETE',
    headers: {
      'AccessKey': ACCESS_KEY,
    },
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => '');
    throw new Error(`Bunny delete failed (${res.status}): ${text || res.statusText}`);
  }
  return true;
}

// Optionally ensure a folder exists (by uploading a tiny keep file)
export async function ensureUserFolder(userId) {
  try {
    const keep = Buffer.from('');
    await uploadToBunny(String(userId), '.keep', keep, 'application/octet-stream');
  } catch {
    // Swallow errors; folder will be created implicitly by first file upload anyway.
  }
}