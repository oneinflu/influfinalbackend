// Seed script: creates a demo Agency owner with clients, collaborators,
// projects, services, team, leads, milestones, invoices, and payments.
// Run with: npm run seed:agency

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Role from '../models/Role.js';
import Client from '../models/Client.js';
import Service from '../models/Service.js';
import ContentType from '../models/ContentType.js';
import Collaborator from '../models/Collaborator.js';
import TeamMember from '../models/TeamMember.js';
import Lead from '../models/Lead.js';
import Project from '../models/Project.js';
import Milestone from '../models/Milestone.js';
import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import { ensureOwnerRolesSeeded } from '../utils/roleSeeding.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || process.env.DATABASE_URL || 'mongodb://127.0.0.1:27017/influ';

// Configurable owner details via env
const AGENCY_EMAIL = (process.env.AGENCY_EMAIL || 'agency.owner@oneinflu.com').toLowerCase();
const AGENCY_NAME = process.env.AGENCY_NAME || 'OneInflu Agency';
const AGENCY_PASSWORD = process.env.AGENCY_PASSWORD || 'Agency@123';

async function connect() {
  await mongoose.connect(MONGO_URI, { dbName: process.env.DB_NAME || undefined });
  mongoose.set('strictQuery', true);
}

function oid(id) {
  try { return new mongoose.Types.ObjectId(id); } catch { return null; }
}

async function ensureOwnerAgencyUser() {
  let owner = await User.findOne({ 'registration.email': AGENCY_EMAIL });
  if (!owner) {
    const u = new User({
      registration: {
        name: AGENCY_NAME,
        email: AGENCY_EMAIL,
        roles: ['agency', 'manager'],
        primaryRole: 'agency',
        isOwner: true,
      },
      profile: {
        slug: await User.generateUniqueSlug(AGENCY_NAME),
      },
      businessInformation: {
        businessName: AGENCY_NAME,
        teamSize: 5,
        website: 'https://oneinflu.example.com',
      },
      verification: { emailVerified: true },
      meta: { status: 'active' },
      passwordHash: await bcrypt.hash(AGENCY_PASSWORD, 10),
    });
    await u.validate();
    owner = await u.save();
    console.log('Created agency owner:', AGENCY_EMAIL);
  } else {
    console.log('Agency owner exists:', AGENCY_EMAIL);
    // Ensure password is set for existing owner
    if (!owner.passwordHash) {
      owner.passwordHash = await bcrypt.hash(AGENCY_PASSWORD, 10);
      await owner.save();
      console.log('Set password for existing agency owner');
    }
  }
  return owner;
}

async function ensureContentTypesAvailable() {
  const cts = await ContentType.find({ status: 'active' }).select('_id name').lean();
  if (cts.length === 0) {
    const defaults = [
      { name: 'Reel', description: 'Short vertical video', status: 'active' },
      { name: 'Post', description: 'Standard feed post', status: 'active' },
    ];
    for (const d of defaults) {
      try {
        const ct = new ContentType(d);
        await ct.validate();
        await ct.save();
        console.log('Created fallback ContentType:', d.name);
      } catch (err) {
        if (!(err && err.code === 11000)) throw err;
      }
    }
    return await ContentType.find({ status: 'active' }).select('_id name').lean();
  }
  return cts;
}

async function seedOwnerRoles(ownerId) {
  await ensureOwnerRolesSeeded(ownerId);
  const roles = await Role.find({ createdBy: ownerId }).select('_id name').lean();
  const byName = (n) => roles.find((r) => String(r.name).toLowerCase() === n.toLowerCase());
  return {
    ownerAdmin: byName('Owner Admin')?._id,
    manager: byName('Manager')?._id,
    viewer: byName('Viewer')?._id,
    sales: byName('Sales')?._id,
    finance: byName('Finance')?._id,
  };
}

async function createTeam(ownerId, ownerRoles) {
  const teamDefs = [
    { name: 'Aisha Khan', email: 'aisha.khan@oneinflu.com', phone: '+911000000001', role: ownerRoles.manager },
    { name: 'Rahul Mehta', email: 'rahul.mehta@oneinflu.com', phone: '+911000000002', role: ownerRoles.sales },
    { name: 'Priya Singh', email: 'priya.singh@oneinflu.com', phone: '+911000000003', role: ownerRoles.viewer },
  ];
  const team = [];
  for (const def of teamDefs) {
    let tm = await TeamMember.findOne({ email: def.email, managed_by: ownerId }).lean();
    if (!tm) {
      const doc = new TeamMember({
        name: def.name,
        email: def.email,
        phone: def.phone,
        role: def.role,
        status: 'active',
        managed_by: ownerId,
      });
      await doc.validate();
      tm = await doc.save();
      console.log('Created team member:', def.email);
    } else {
      console.log('Team member exists:', def.email);
    }
    team.push(tm);
  }
  return team;
}

async function createServices(ownerId, contentTypes) {
  const ctMap = Object.fromEntries(contentTypes.map((c) => [c.name, c._id]));
  const defs = [
    {
      name: 'Instagram Reel',
      description: '30-60s high-quality vertical video',
      deliverables: ['1 Reel', 'Caption copy', 'Hashtag research'],
      content_types: [ctMap['Reel']].filter(Boolean),
      pricing_plans: [{ currency: 'INR', is_price_range: false, amount: 30000, plan_type: 'per_post' }],
    },
    {
      name: 'YouTube Video',
      description: '5-10 min integrated video content',
      deliverables: ['1 Integrated video', 'Call-to-action overlay'],
      content_types: [ctMap['Long Video'] || ctMap['Short Video']].filter(Boolean),
      pricing_plans: [{ currency: 'INR', is_price_range: false, amount: 150000, plan_type: 'per_project' }],
    },
  ];
  const services = [];
  for (const d of defs) {
    let s = await Service.findOne({ name: d.name, user_id: ownerId }).lean();
    if (!s) {
      const doc = new Service({
        ...d,
        is_barter: false,
        is_negotiable: true,
        user_id: ownerId,
        status: 'active',
      });
      await doc.validate();
      s = await doc.save();
      console.log('Created service:', d.name);
    } else {
      console.log('Service exists:', d.name);
    }
    services.push(s);
  }
  return services;
}

async function createCollaboratorUsers() {
  const defs = [
    { name: 'Rohit Sharma', email: 'rohit.influencer@oneinflu.com', primaryRole: 'influencer' },
    { name: 'Ananya Verma', email: 'ananya.ugc@oneinflu.com', primaryRole: 'UGC creator' },
  ];
  const users = [];
  for (const d of defs) {
    let u = await User.findOne({ 'registration.email': d.email }).lean();
    if (!u) {
      const doc = new User({
        registration: { name: d.name, email: d.email, roles: [d.primaryRole], primaryRole: d.primaryRole },
        profile: { slug: await User.generateUniqueSlug(d.name) },
        meta: { status: 'active' },
      });
      await doc.validate();
      u = await doc.save();
      console.log('Created collaborator user:', d.email);
    } else {
      console.log('Collaborator user exists:', d.email);
    }
    users.push(u);
  }
  return users;
}

async function createCollaborators(ownerId, colUsers) {
  const defs = [
    { users: colUsers[0]?._id, type: 'Influencer' },
    { users: colUsers[1]?._id, type: 'UGC creator' },
  ].filter((d) => d.users);
  const collabs = [];
  for (const d of defs) {
    let c = await Collaborator.findOne({ users: d.users, managed_by: ownerId, type: d.type }).lean();
    if (!c) {
      const doc = new Collaborator({ users: d.users, managed_by: ownerId, type: d.type, status: 'active' });
      await doc.validate();
      c = await doc.save();
      console.log('Created collaborator:', d.type);
    } else {
      console.log('Collaborator exists:', d.type);
    }
    collabs.push(c);
  }
  return collabs;
}

async function createClients(ownerId) {
  const defs = [
    {
      business_name: 'Acme Corp',
      type: 'company',
      industry: 'Technology',
      invoice_type: 'business',
      point_of_contact: { name: 'Neha Gupta', email: 'neha@acme.example.com', phone: '+911234567890' },
      location: { country: 'IN', city: 'Bengaluru' },
    },
    {
      business_name: 'Sunrise Travels',
      type: 'company',
      industry: 'Travel',
      invoice_type: 'business',
      point_of_contact: { name: 'Arun Rao', email: 'arun@sunrise.example.com', phone: '+919876543210' },
      location: { country: 'IN', city: 'Mumbai' },
    },
  ];
  const clients = [];
  for (const d of defs) {
    let c = await Client.findOne({ business_name: d.business_name, added_by: ownerId }).lean();
    if (!c) {
      const doc = new Client({ ...d, status: 'active', added_by: ownerId });
      await doc.validate();
      c = await doc.save();
      console.log('Created client:', d.business_name);
    } else {
      console.log('Client exists:', d.business_name);
    }
    clients.push(c);
  }
  return clients;
}

function nextInvoiceNumber(prefix = 'AG') {
  const yr = new Date().getFullYear();
  const rnd = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
  return `${prefix}-${yr}-${rnd}`;
}

async function createProjectsWithMilestones(ownerId, clients, services, collabs) {
  const defs = [
    {
      name: 'Acme Reel Launch',
      client: clients[0]?._id,
      services: [services[0]?._id].filter(Boolean),
      collaborators: [collabs[0]?._id].filter(Boolean),
      project_category: ['Social Media'],
      status: 'in_progress',
      target: { platforms: ['Instagram'], location: ['India'], age_groups: ['18-24'] },
      milestones: [
        { name: 'Concept & Script', amount: 10000, dueDays: 7 },
        { name: 'Production & Edit', amount: 20000, dueDays: 14 },
      ],
    },
    {
      name: 'Sunrise Travel Vlog',
      client: clients[1]?._id,
      services: [services[1]?._id].filter(Boolean),
      collaborators: [collabs[1]?._id].filter(Boolean),
      project_category: ['YouTube'],
      status: 'in_progress',
      target: { platforms: ['YouTube'], location: ['India'], age_groups: ['25-34'] },
      milestones: [
        { name: 'Scripting & Pre-production', amount: 50000, dueDays: 10 },
        { name: 'Shoot & Edit', amount: 100000, dueDays: 25 },
      ],
    },
  ].filter((p) => p.client);

  const projects = [];

  for (const def of defs) {
    let proj = await Project.findOne({ name: def.name, client: def.client }).lean();
    if (!proj) {
      const doc = new Project({
        name: def.name,
        client: def.client,
        services: def.services,
        collaborators: def.collaborators,
        project_category: def.project_category,
        status: def.status,
        target: def.target,
        notes: '',
      });
      await doc.validate();
      proj = await doc.save();
      console.log('Created project:', def.name);
    } else {
      console.log('Project exists:', def.name);
    }

    // Ensure milestones
    const msIds = [];
    for (const m of def.milestones) {
      const due = new Date(Date.now() + m.dueDays * 24 * 60 * 60 * 1000);
      let ms = await Milestone.findOne({ name: m.name, amount: m.amount, due_date: due }).lean();
      if (!ms) {
        const d = new Milestone({ name: m.name, amount: m.amount, due_date: due, status: 'in_progress' });
        await d.validate();
        ms = await d.save();
        console.log('Created milestone:', m.name);
      }
      msIds.push(ms._id);
    }

    // Attach milestones to project
    await Project.findByIdAndUpdate(proj._id, { $set: { deliverables: msIds } });
    projects.push({ project: proj, milestones: msIds });
  }

  return projects;
}

async function createInvoicesAndPayments(ownerId, clients, projectBundles) {
  const created = { invoices: [], payments: [] };
  for (const bundle of projectBundles) {
    const proj = bundle.project;
    const client = clients.find((c) => String(c._id) === String(proj.client));
    if (!client) continue;

    for (const msId of bundle.milestones) {
      // Invoice per milestone
      const subtotal = (await Milestone.findById(msId).select('amount').lean())?.amount || 0;
      const invoice_number = nextInvoiceNumber('AG');
      let inv = await Invoice.findOne({ invoice_number }).lean();
      if (!inv) {
        const doc = new Invoice({
          invoice_number,
          issue_date: new Date(),
          due_date: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
          tax_percentage: 18,
          subtotal,
          currency: 'INR',
          payment_status: 'pending',
          created_by: ownerId,
          client: client._id,
          project: proj._id,
          notes: `Invoice for milestone ${msId.toString()}`,
        });
        await doc.validate();
        inv = await doc.save();
        console.log('Created invoice:', inv.invoice_number);
      } else {
        console.log('Invoice exists:', inv.invoice_number);
      }

      // Attach invoice to milestone
      await Milestone.findByIdAndUpdate(msId, { $set: { 'invoice_attached.invoice_id': inv._id, 'invoice_attached.attached_on': new Date() } });

      // Create payment (full payment for demo)
      const payDef = {
        payment_date: new Date(),
        amount: inv.total || subtotal,
        mode: 'BANK',
        transaction_id: `TX-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        remarks: 'Demo payment',
        invoice_id: inv._id,
        paid_by: client._id,
        received_by: ownerId,
      };
      let payment = await Payment.findOne({ transaction_id: payDef.transaction_id }).lean();
      if (!payment) {
        const p = new Payment(payDef);
        await p.validate();
        payment = await p.save();
        console.log('Created payment:', payment.transaction_id);
      }

      // Link payment to invoice and mark status
      await Invoice.findByIdAndUpdate(inv._id, { $addToSet: { payments: payment._id }, $set: { payment_status: 'paid' } });

      created.invoices.push(inv);
      created.payments.push(payment);
    }
  }
  return created;
}

async function createLeads(services, team) {
  const defs = [
    {
      name: 'Kiran Kumar',
      email: 'kiran.lead@example.com',
      phone: '+911112223334',
      website: 'https://lead.example.com',
      budget: 60000,
      looking_for: [services[0]?._id].filter(Boolean),
      status: 'qualified',
      assigned_to: team[1]?._id, // sales
    },
    {
      name: 'Maya Iyer',
      email: 'maya.lead@example.com',
      phone: '+919998887776',
      website: 'https://maya.example.com',
      budget: 180000,
      looking_for: [services[1]?._id].filter(Boolean),
      status: 'proposal_sent',
      assigned_to: team[0]?._id, // manager
    },
  ];
  const leads = [];
  for (const d of defs) {
    let l = await Lead.findOne({ email: d.email }).lean();
    if (!l) {
      const doc = new Lead(d);
      await doc.validate();
      l = await doc.save();
      console.log('Created lead:', d.email);
    } else {
      console.log('Lead exists:', d.email);
    }
    leads.push(l);
  }
  return leads;
}

async function main() {
  await connect();
  console.log('Connected to MongoDB');

  const owner = await ensureOwnerAgencyUser();
  const ownerId = oid(owner._id);

  // Owner-scoped roles
  const ownerRoles = await seedOwnerRoles(ownerId);

  // Team under owner
  const team = await createTeam(ownerId, ownerRoles);

  // Content types and owner services
  const contentTypes = await ensureContentTypesAvailable();
  const services = await createServices(ownerId, contentTypes);

  // Collaborator users and collaborator links under owner
  const collaboratorUsers = await createCollaboratorUsers();
  const collaborators = await createCollaborators(ownerId, collaboratorUsers);

  // Clients added by owner
  const clients = await createClients(ownerId);

  // Projects with milestones
  const projectBundles = await createProjectsWithMilestones(ownerId, clients, services, collaborators);

  // Invoices and payments per milestone
  const finance = await createInvoicesAndPayments(ownerId, clients, projectBundles);

  // Leads seeded and assigned
  const leads = await createLeads(services, team);

  console.log('--- Seed Summary ---');
  console.log('Owner:', owner.registration?.email);
  console.log('Roles:', ownerRoles);
  console.log('Team members:', team.length);
  console.log('Services:', services.length);
  console.log('Collaborators:', collaborators.length);
  console.log('Clients:', clients.length);
  console.log('Projects:', projectBundles.length);
  const milestoneCount = projectBundles.reduce((acc, b) => acc + (b.milestones?.length || 0), 0);
  console.log('Milestones:', milestoneCount);
  console.log('Invoices:', finance.invoices.length);
  console.log('Payments:', finance.payments.length);
  console.log('Leads:', leads.length);

  await mongoose.disconnect();
  console.log('Disconnected. Agency demo seed completed.');
}

main().catch(async (err) => {
  console.error('Seed error:', err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});