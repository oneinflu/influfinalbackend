// Import Express to create the web server and define routes
import express from 'express';
// Import CORS to allow browser clients from different origins to call our API
import cors from 'cors';
// Import morgan to log HTTP requests during development and production
import morgan from 'morgan';
// Node core modules used for path resolution and file checks
import path from 'path';
import fs from 'fs';
// Load environment variables from .env into process.env
import 'dotenv/config';
// Helper to compute __dirname in ES modules
import { fileURLToPath } from 'url';
// Local module: MongoDB connection helper
import connectDB from './config/db.js';
// Local module: health check route (GET /api/health)
import healthRouter from './routes/health.js';
import servicesRouter from './routes/services.js';
import invoicesRouter from './routes/invoices.js';
import paymentsRouter from './routes/payments.js';
import clientsRouter from './routes/clients.js';
import projectsRouter from './routes/projects.js';
import milestonesRouter from './routes/milestones.js';
import leadsRouter from './routes/leads.js';
import collaboratorsRouter from './routes/collaborators.js';
import testimonialsRouter from './routes/testimonials.js';
import teamMembersRouter from './routes/teamMembers.js';
import publicProfilesRouter from './routes/publicProfiles.js';
import publicRouter from './routes/public.js';
import adminsRouter from './routes/admins.js';
import categoriesRouter from './routes/categories.js';
import permissionGroupsRouter from './routes/permissionGroups.js';
import portfoliosRouter from './routes/portfolios.js';
import rolesRouter from './routes/roles.js';
import contentTypesRouter from './routes/contentTypes.js';
import usersRouter from './routes/users.js';
import authRouter from './routes/auth.js';
import uploadsRouter from './routes/uploads.js';

// Environment variables (PORT, MONGO_URI, etc.) are initialized via side-effect import above

// Compute the current file path and directory for static asset serving
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create our Express application instance
const app = express();

// Debug: print env variables used by the server (safely masked)
function mask(val) {
  if (!val) return '';
  const s = String(val);
  if (s.length <= 8) return '*'.repeat(s.length);
  return s.slice(0, 4) + '...' + s.slice(-4);
}
console.log('[ENV] NODE_ENV:', process.env.NODE_ENV || '');
console.log('[ENV] PORT:', process.env.PORT || '');
console.log('[ENV] MONGO_URI:', process.env.MONGO_URI ? mask(process.env.MONGO_URI) : '');
console.log('[ENV] DB_NAME:', process.env.DB_NAME || '');
console.log('[ENV] JWT_SECRET:', process.env.JWT_SECRET ? mask(process.env.JWT_SECRET) : '');
console.log('[ENV] JWT_EXPIRES_IN:', process.env.JWT_EXPIRES_IN || '');
console.log('[ENV] BUNNY_STORAGE_ZONE:', process.env.BUNNY_STORAGE_ZONE || '');
console.log('[ENV] BUNNY_CDN_BASE_URL:', process.env.BUNNY_CDN_BASE_URL || '');
console.log('[ENV] BUNNY_ACCESS_KEY:', process.env.BUNNY_ACCESS_KEY ? mask(process.env.BUNNY_ACCESS_KEY) : '');

// Middleware
// Enable CORS so the frontend (even if hosted on a different domain) can call the API
app.use(cors());
// Parse incoming JSON request bodies into req.body
app.use(express.json());
// Log HTTP requests (more verbose in dev, standard in production)
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// API routes
// Mount health check endpoint under /api/health
app.use('/api/health', healthRouter);
// Mount authentication endpoints under /api/auth
app.use('/api/auth', authRouter);
// Mount services CRUD under /api/services
app.use('/api/services', servicesRouter);
// Mount invoices CRUD under /api/invoices
app.use('/api/invoices', invoicesRouter);
// Mount payments CRUD under /api/payments
app.use('/api/payments', paymentsRouter);
// Mount clients CRUD under /api/clients
app.use('/api/clients', clientsRouter);
// Mount projects CRUD under /api/projects
app.use('/api/projects', projectsRouter);
// Mount milestones CRUD under /api/milestones
app.use('/api/milestones', milestonesRouter);
// Mount leads CRUD under /api/leads
app.use('/api/leads', leadsRouter);
// Mount collaborators CRUD under /api/collaborators
app.use('/api/collaborators', collaboratorsRouter);
// Mount testimonials CRUD under /api/testimonials
app.use('/api/testimonials', testimonialsRouter);
// Mount team members CRUD under /api/team-members
app.use('/api/team-members', teamMembersRouter);
// Mount public profiles CRUD under /api/public-profiles
app.use('/api/public-profiles', publicProfilesRouter);
// Mount unauthenticated public endpoints under /api/public
app.use('/api/public', publicRouter);
// Mount admins CRUD under /api/admins
app.use('/api/admins', adminsRouter);
// Mount categories CRUD under /api/categories
app.use('/api/categories', categoriesRouter);
// Mount permission groups CRUD under /api/permission-groups
app.use('/api/permission-groups', permissionGroupsRouter);
// Mount portfolios CRUD under /api/portfolios
app.use('/api/portfolios', portfoliosRouter);
// Mount roles CRUD under /api/roles
app.use('/api/roles', rolesRouter);
app.use('/api/content-types', contentTypesRouter);
// Mount users CRUD under /api/users
app.use('/api/users', usersRouter);
app.use('/api/uploads', uploadsRouter);

// Static serving for frontend build (if present)
// Serve the production frontend build (if present) from server/public
// This allows a single service to host both API and UI in production
const publicDir = path.resolve(__dirname, '../public');
if (fs.existsSync(publicDir)) {
  // Serve static assets (JS, CSS, images) from public/
  app.use(express.static(publicDir));
  // For any non-API route, send back index.html (client-side routing support)
  app.get('*', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

// Connect to MongoDB (skips if MONGO_URI not provided)
// Connect to MongoDB (skips gracefully when MONGO_URI is not defined)
await connectDB();

// Start server
// Read port from environment (DigitalOcean sets PORT); default to 8080 locally
const port = process.env.PORT || 8080;
// Start HTTP server and log the listening port
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});