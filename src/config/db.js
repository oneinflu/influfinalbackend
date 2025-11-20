import mongoose from 'mongoose';

// Establish a connection to MongoDB using Mongoose
// Reads `MONGO_URI` and optional `DB_NAME` from environment variables
export default async function connectDB() {
  // Connection string, e.g. Atlas SRV or local mongodb://127.0.0.1:27017
  const uri = process.env.MONGO_URI;

  // If no URI is provided, skip connecting (useful for API-only dev without DB)
  if (!uri) {
    console.warn('MONGO_URI not set; skipping MongoDB connection');
    return;
  }

  // Only crash the process on connection failure in production
  const isProduction = process.env.NODE_ENV === 'production';

  try {
    // Connect to MongoDB; `dbName` is optional and can also be set in the URI path
    await mongoose.connect(uri, {
      dbName: process.env.DB_NAME || undefined,
    });
    console.log('MongoDB connected');
  } catch (err) {
    // Common causes: invalid host in SRV URI, DNS resolution issues, bad credentials, or blocked IPs
    console.error('MongoDB connection error:', err.message);
    console.error('Check that your MONGO_URI host is correct and accessible, and that IP access is allowed.');

    if (isProduction) {
      // In production, exit so the platform restarts the service after misconfiguration
      process.exit(1);
    } else {
      // In development, continue running the API without a DB connection to unblock other work
      console.warn('Continuing without DB (development mode). Some endpoints may not function.');
    }
  }
}