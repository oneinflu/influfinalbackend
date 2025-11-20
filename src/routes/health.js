// Import Router to create an isolated route module
import { Router } from 'express';

// Create a new router instance for health-related endpoints
const router = Router();

// GET /api/health
// Returns a simple JSON payload indicating the API is reachable
router.get('/', (req, res) => {
  // Respond with status and a server-side timestamp
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Export the router to be mounted in the main server
export default router;