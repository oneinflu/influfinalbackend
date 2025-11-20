import Portfolio from '../models/Portfolio.js';

export const MAX_STORAGE_BYTES = 15 * 1024 * 1024 * 1024; // 15GB

export async function getUserStorageUsageBytes(userId) {
  const ownerId = String(userId);
  const items = await Portfolio.find({ belongs_to: ownerId }).select('size_bytes thumbnail_size_bytes').lean();
  let total = 0;
  for (const it of items) {
    const media = typeof it.size_bytes === 'number' ? it.size_bytes : 0;
    const thumb = typeof it.thumbnail_size_bytes === 'number' ? it.thumbnail_size_bytes : 0;
    total += media + thumb;
  }
  return total;
}