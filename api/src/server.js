import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import staticFiles from '@fastify/static';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { searchRoutes } from './routes/search.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3001');
const HOST = process.env.HOST || '0.0.0.0';

const fastify = Fastify({
  logger: process.env.NODE_ENV !== 'production' ? { level: 'info' } : false,
});

// CORS
await fastify.register(cors, {
  origin: process.env.NODE_ENV === 'production'
    ? [process.env.FRONTEND_URL || 'https://candidates.up.railway.app']
    : true,
});

// Serve frontend static files
const webDir = join(__dirname, '../../web');
await fastify.register(staticFiles, {
  root: webDir,
  prefix: '/',
});

// API routes
await fastify.register(searchRoutes);

// Health check
fastify.get('/health', async () => ({
  status: 'ok',
  version: '1.0.0',
  timestamp: new Date().toISOString(),
}));

// Start
try {
  await fastify.listen({ port: PORT, host: HOST });
  console.log(`🚀 Candidates Platform API — http://localhost:${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
