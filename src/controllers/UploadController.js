import { ensureUserFolder, uploadToBunny } from '../utils/bunnyStorage.js';
import { getUserStorageUsageBytes, MAX_STORAGE_BYTES } from '../utils/storageUsage.js';
import { getAuthFromRequest } from '../middleware/auth.js';
import TeamMember from '../models/TeamMember.js';

const UploadController = {
  async portfolio(req, res) {
    try {
      const { user_id, filename } = req.query || {};
      if (!filename) return res.status(400).json({ error: 'filename is required' });

      const auth = await getAuthFromRequest(req);
      if (!auth || (auth.type !== 'admin' && auth.type !== 'user')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Determine the target owner folder for the upload
      // - Admins: must provide user_id (explicit target owner)
      // - Owners: always use their own id; if user_id provided and differs, forbid
      // - Team members: ignore provided user_id and route to their owner's (managed_by) folder
      let targetUserId = null;
      if (auth.type === 'admin') {
        if (!user_id) return res.status(400).json({ error: 'user_id is required for admin uploads' });
        targetUserId = String(user_id);
      } else {
        const entity = auth.entity || {};
        if (entity?.registration?.isOwner === true) {
          targetUserId = String(auth.id);
          if (user_id && String(user_id) !== targetUserId) {
            return res.status(403).json({ error: 'Forbidden: owners can only upload to their own folder' });
          }
        } else {
          const email = entity?.registration?.email;
          if (!email) return res.status(403).json({ error: 'Forbidden' });
          const tm = await TeamMember.findOne({ email, status: 'active' })
            .select('managed_by')
            .lean();
          if (!tm || !tm.managed_by) {
            return res.status(403).json({ error: 'Forbidden: team member scope not found' });
          }
          targetUserId = String(tm.managed_by);
        }
      }

      const contentType = req.headers['content-type'] || 'application/octet-stream';
      const buffer = req.body; // express.raw middleware sets Buffer here
      if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
        return res.status(400).json({ error: 'Empty upload body' });
      }

      // Enforce per-user storage limit (15GB)
      const currentUsage = await getUserStorageUsageBytes(String(targetUserId));
      const nextUsage = currentUsage + buffer.length;
      if (nextUsage > MAX_STORAGE_BYTES) {
        return res.status(413).json({ error: 'Storage limit exceeded (15GB). Please delete items before uploading more.' });
      }

      await ensureUserFolder(String(targetUserId));
      const url = await uploadToBunny(String(targetUserId), String(filename), buffer, contentType);
      return res.json({ url });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  },
};

export default UploadController;