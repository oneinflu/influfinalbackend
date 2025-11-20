// Utilities to seed default roles for a new owner
// - Clones all system roles (is_system_role: true) into the owner's scope
// - Ensures a locked "Owner Admin" role with full access exists for the owner

import mongoose from 'mongoose';
import Role from '../models/Role.js';
import PermissionGroup from '../models/PermissionGroup.js';

const OWNER_ADMIN_ROLE_NAME = 'Owner Admin';

function toObjectId(id) {
  try {
    return new mongoose.Types.ObjectId(id);
  } catch {
    return null;
  }
}

async function buildFullAccessMatrix() {
  const groups = await PermissionGroup.find({ visibility: 'public' }).lean();
  const matrix = {};
  for (const g of groups) {
    const groupKey = g.group;
    const perms = {};
    for (const p of g.permissions || []) {
      if (!p || !p.key) continue;
      perms[p.key] = true;
    }
    matrix[groupKey] = perms;
  }
  return matrix;
}

/**
 * Ensures default roles exist for an owner:
 * - Locked full-access role named OWNER_ADMIN_ROLE_NAME
 * - Cloned copies of all system roles (excluding OWNER_ADMIN_ROLE_NAME)
 */
export async function ensureOwnerRolesSeeded(ownerId) {
  const ownerOid = toObjectId(ownerId);
  if (!ownerOid) throw new Error('Invalid owner id for role seeding');

  // 1) Ensure locked full-access Owner Admin role exists
  const existingOwnerAdmin = await Role.findOne({ createdBy: ownerOid, name: OWNER_ADMIN_ROLE_NAME }).lean();
  if (!existingOwnerAdmin) {
    const fullMatrix = await buildFullAccessMatrix();
    try {
      const ownerRole = new Role({
        name: OWNER_ADMIN_ROLE_NAME,
        description: 'Full-access owner role (locked) with all permissions',
        permissions: fullMatrix,
        createdBy: ownerOid,
        is_system_role: false,
        locked: true,
      });
      await ownerRole.validate();
      await ownerRole.save();
    } catch (err) {
      // ignore duplicate errors due to race conditions; rethrow others
      if (!(err && err.code === 11000)) throw err;
    }
  }

  // 2) Clone all system roles into owner's scope (skip OWNER_ADMIN_ROLE_NAME)
  const templates = await Role.find({ is_system_role: true }).lean();
  for (const tmpl of templates) {
    const name = String(tmpl.name || '').trim();
    if (!name || name === OWNER_ADMIN_ROLE_NAME) continue;
    const exists = await Role.findOne({ createdBy: ownerOid, name }).lean();
    if (exists) continue; // don't duplicate per owner
    try {
      const clone = new Role({
        name,
        description: tmpl.description,
        permissions: tmpl.permissions || {},
        createdBy: ownerOid,
        is_system_role: false,
        locked: false,
        source_template: tmpl._id,
      });
      await clone.validate();
      await clone.save();
    } catch (err) {
      // ignore duplicate errors due to concurrent seeding; rethrow others
      if (!(err && err.code === 11000)) throw err;
    }
  }

  return { ok: true };
}

export default {
  ensureOwnerRolesSeeded,
};