import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Admin from '../models/Admin.js';
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

async function cleanupExcept(allowed) {
  const collections = await mongoose.connection.db.listCollections().toArray();
  const names = collections.map((c) => c.name).filter((n) => !n.startsWith('system.'));
  for (const name of names) {
    if (allowed.has(name)) continue;
    try {
      await mongoose.connection.db.dropCollection(name);
      console.log('Dropped collection:', name);
    } catch (err) {
      if (String(err?.message || '').includes('ns not found')) {
        console.log('Skip missing collection:', name);
      } else {
        throw err;
      }
    }
  }
}

async function ensureAdmin() {
  let admin = await Admin.findOne({ email: ADMIN_EMAIL }).lean();
  if (!admin) {
    admin = await new Admin({ name: 'Super Admin', email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: 'super-admin', status: 'active' }).save();
    console.log('Created admin:', admin.email);
  } else {
    console.log('Admin already exists:', admin.email);
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
    const ct = new ContentType({ ...it, status: 'active' });
    await ct.validate();
    await ct.save();
    console.log('Created ContentType:', it.name);
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
    const cat = new Category({ name: it.name, slug, is_active: true });
    await cat.validate();
    await cat.save();
    console.log('Created Category:', it.name);
  }
}

async function main() {
  console.log('Connecting to DB...');
  await connect();
  const allowed = new Set([
    Admin.collection.collectionName,
    Category.collection.collectionName,
    ContentType.collection.collectionName,
  ]);
  console.log('Preserving collections:', Array.from(allowed).join(', '));
  console.log('Dropping all other collections...');
  await cleanupExcept(allowed);
  console.log('Seeding Admin...');
  await ensureAdmin();
  console.log('Seeding ContentTypes...');
  await ensureContentTypes();
  console.log('Seeding Categories...');
  await ensureCategories();
  await mongoose.disconnect();
  console.log('Cleanup and seed complete.');
}

main().catch(async (err) => {
  console.error('Cleanup failed:', err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});

