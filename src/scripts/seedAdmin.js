// Seed script: creates a default Admin, a System User owner, PermissionGroups,
// and a set of system role templates. Run with: npm run seed:admin

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Admin from '../models/Admin.js';
import User from '../models/User.js';
import PermissionGroup from '../models/PermissionGroup.js';
import Role from '../models/Role.js';
import ContentType from '../models/ContentType.js';
import Category from '../models/Category.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || process.env.DATABASE_URL || 'mongodb://127.0.0.1:27017/influ';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@oneinflu.com').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '!Billion123$';

async function connect() {
  await mongoose.connect(MONGO_URI, { dbName: process.env.DB_NAME || undefined });
  mongoose.set('strictQuery', true);
}

async function ensureAdmin() {
  let admin = await Admin.findOne({ email: ADMIN_EMAIL }).lean();
  if (!admin) {
    admin = await new Admin({
      name: 'Super Admin',
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD, // storehashed in real deployments
      role: 'super-admin',
      status: 'active',
    }).save();
    console.log('Created admin:', admin.email);
  } else {
    console.log('Admin already exists:', admin.email);
  }
  return admin;
}

async function ensureSystemUser() {
  const systemEmail = (process.env.SYSTEM_USER_EMAIL || 'system@oneinflu.com').toLowerCase();
  let user = await User.findOne({ 'registration.email': systemEmail }).lean();
  if (!user) {
    const u = new User({
      registration: {
        email: systemEmail,
        isOwner: true,
        roles: ['manager'],
        primaryRole: 'manager',
      },
      profile: {
        displayName: 'System',
        slug: 'system',
      },
    });
    await u.validate();
    user = await u.save();
    console.log('Created system user:', systemEmail);
  } else {
    console.log('System user already exists:', systemEmail);
  }
  return user;
}

function group(name, description, keys, visibility = 'private') {
  return {
    group: name,
    name: description,
    description,
    permissions: keys.map((k) => ({ key: k, label: k.replace(/_/g, ' '), description: '', default: false })),
    visibility,
  };
}

async function ensurePermissionGroups() {
  // Default visibility is private to hide groups from tenant role builders
  // Select essential groups for tenant roles as public (override below)
  const defs = [
    // Team and people
    group('team', 'Team Management', ['view_team', 'create_team', 'update_team', 'delete_team'], 'public'),
    group('user', 'Users', ['view_user', 'create_user', 'update_user', 'delete_user']),
    group('collaborator', 'Collaborators', ['view_collaborator', 'create_collaborator', 'update_collaborator', 'delete_collaborator'], 'public'),

    // Sales funnel
    group('lead', 'Lead Management', ['view_lead', 'create_lead', 'update_lead', 'delete_lead'], 'public'),
    group('client', 'Clients', ['view_client', 'create_client', 'update_client', 'delete_client'], 'public'),

    // Work management
    group('project', 'Project Management', ['view_project', 'create_project', 'update_project', 'delete_project'], 'public'),
    group('milestone', 'Milestones', ['view_milestone', 'create_milestone', 'update_milestone', 'delete_milestone'], 'public'),

    // Catalogs and content
    group('service', 'Service Catalog', ['view_service', 'create_service', 'update_service', 'delete_service'], 'public'),
    // Content types and categories are private and should not be displayed to users
    group('content_type', 'Content Types', ['view_content_type', 'create_content_type', 'update_content_type', 'delete_content_type'], 'private'),
    group('category', 'Categories', ['view_category', 'create_category', 'update_category', 'delete_category'], 'private'),
    group('portfolio', 'Portfolios', ['view_portfolio', 'create_portfolio', 'update_portfolio', 'delete_portfolio'], 'public'),
    group('testimonial', 'Testimonials', ['view_testimonial', 'create_testimonial', 'update_testimonial', 'delete_testimonial'], 'public'),
    group('profile', 'Public Profile', ['view_profile', 'create_profile', 'update_profile', 'delete_profile'], 'public'),

    // Finance
    group('payment', 'Payments', ['view_payment', 'create_payment', 'update_payment', 'delete_payment'], 'public'),
    group('invoice', 'Invoices', ['view_invoice', 'create_invoice', 'update_invoice', 'delete_invoice'], 'public'),

    // System governance
    group('role', 'Role Management', ['create_role', 'update_role', 'delete_role', 'view_role'], 'public'),
    group('permission_group', 'Permission Groups', ['view_permission_group', 'create_permission_group', 'update_permission_group', 'delete_permission_group'],'private'),
    group('admin', 'Admin Controls', ['view_admin', 'create_admin', 'update_admin', 'delete_admin'],'private'),
  ];
  for (const def of defs) {
    const exists = await PermissionGroup.findOne({ group: def.group }).lean();
    if (!exists) {
      try {
        const pg = new PermissionGroup(def);
        await pg.validate();
        await pg.save();
        console.log('Created permission group:', def.group);
      } catch (err) {
        if (err && err.code === 11000) {
          console.log('Permission group duplicate skipped:', def.group);
        } else {
          throw err;
        }
      }
    } else {
      // Ensure visibility policy is enforced (e.g., content_type, category should be private)
      if (exists.visibility !== def.visibility) {
        await PermissionGroup.updateOne({ _id: exists._id }, { $set: { visibility: def.visibility } });
        console.log('Updated permission group visibility:', def.group, '->', def.visibility);
      } else {
        console.log('Permission group exists:', def.group);
      }
    }
  }
}

function roleTemplate(name, description, matrix) {
  return { name, description, permissions: matrix };
}

function matrixFrom(groups) {
  const m = {};
  for (const [g, keys] of Object.entries(groups)) {
    m[g] = {};
    for (const k of keys) m[g][k] = true;
  }
  return m;
}

async function ensureSystemRoles(systemOwnerId) {
  const templates = [
    roleTemplate('Viewer', 'View-only access across modules', matrixFrom({
      team: ['view_team'],
      lead: ['view_lead'],
      project: ['view_project'],
      profile: ['view_profile'],
      service: ['view_service'],
      collaborator: ['view_collaborator'],
      payment: ['view_payment'],
    })),
    roleTemplate('Manager', 'Manage team, profiles, projects, services, leads, collaborators', matrixFrom({
      team: ['view_team', 'create_team', 'update_team'],
      lead: ['view_lead', 'create_lead', 'update_lead'],
      project: ['view_project', 'create_project', 'update_project'],
      profile: ['view_profile', 'create_profile', 'update_profile'],
      service: ['view_service', 'create_service', 'update_service'],
      collaborator: ['view_collaborator', 'create_collaborator', 'update_collaborator'],
    })),
    roleTemplate('Sales', 'Lead and collaborator focused', matrixFrom({
      lead: ['view_lead', 'create_lead', 'update_lead'],
      collaborator: ['view_collaborator', 'create_collaborator', 'update_collaborator'],
    })),
    roleTemplate('Finance', 'Payment visibility', matrixFrom({
      payment: ['view_payment'],
    })),
    roleTemplate('Role Admin', 'Can manage roles for the owner', matrixFrom({
      role: ['create_role', 'update_role', 'delete_role'],
    })),
  ];

  for (const t of templates) {
    const exists = await Role.findOne({ is_system_role: true, name: t.name }).lean();
    if (exists) {
      console.log('System role exists:', t.name);
      continue;
    }
    try {
      const r = new Role({
        name: t.name,
        description: t.description,
        permissions: t.permissions,
        createdBy: systemOwnerId,
        is_system_role: true,
        locked: false,
      });
      await r.validate();
      await r.save();
      console.log('Created system role:', t.name);
    } catch (err) {
      if (err && err.code === 11000) {
        console.log('System role duplicate skipped:', t.name);
      } else {
        throw err;
      }
    }
  }
}

async function ensureContentTypes() {
  const items = [
    { name: 'Reel', description: 'Short vertical video' },
    { name: 'Story', description: 'Ephemeral content story' },
    { name: 'Short Video', description: 'Short-form video (<=60s)' },
    { name: 'Long Video', description: 'Long-form video' },
    { name: 'Post', description: 'Standard feed post' },
    { name: 'Carousel', description: 'Multi-image/video carousel' },
    { name: 'Photo', description: 'Static image content' },
    { name: 'Blog', description: 'Article/blog content' },
    { name: 'Livestream', description: 'Live broadcast content' },
  ];
  for (const it of items) {
    const exists = await ContentType.findOne({ name: it.name }).lean();
    if (exists) {
      console.log('ContentType exists:', it.name);
      continue;
    }
    try {
      const ct = new ContentType({ ...it, status: 'active' });
      await ct.validate();
      await ct.save();
      console.log('Created ContentType:', it.name);
    } catch (err) {
      if (err && err.code === 11000) {
        console.log('ContentType duplicate skipped:', it.name);
      } else {
        throw err;
      }
    }
  }
}

async function ensureCategories() {
  const items = [
    { name: 'Lifestyle' },
    { name: 'Fashion' },
    { name: 'Beauty' },
    { name: 'Technology' },
    { name: 'Travel' },
    { name: 'Food' },
    { name: 'Fitness' },
    { name: 'Music' },
    { name: 'Gaming' },
    { name: 'Education' },
    { name: 'Finance' },
    { name: 'Health' },
    { name: 'Parenting' },
    { name: 'Sports' },
    { name: 'Photography' },
    { name: 'Entertainment' },
  ];
  for (const it of items) {
    const slug = String(it.name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const exists = await Category.findOne({ slug }).lean();
    if (exists) {
      console.log('Category exists:', it.name);
      continue;
    }
    try {
      const cat = new Category({ name: it.name, slug, is_active: true });
      await cat.validate();
      await cat.save();
      console.log('Created Category:', it.name);
    } catch (err) {
      if (err && err.code === 11000) {
        console.log('Category duplicate skipped:', it.name);
      } else {
        throw err;
      }
    }
  }
}

async function main() {
  console.log('Connecting to DB...');
  await connect();
  console.log('Ensuring admin...');
  await ensureAdmin();
  console.log('Ensuring system user...');
  const systemUser = await ensureSystemUser();
  console.log('Ensuring permission groups...');
  await ensurePermissionGroups();
  console.log('Ensuring content types...');
  await ensureContentTypes();
  console.log('Ensuring categories...');
  await ensureCategories();
  console.log('Ensuring system roles...');
  await ensureSystemRoles(systemUser._id);
  console.log('Seed complete.');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Seed failed:', err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});