/**
 * Rotas de busca de candidatos
 *
 * POST /api/search       — inicia busca, retorna jobId
 * GET  /api/search/:id/stream  — SSE stream de progresso
 * GET  /api/search/:id/results — resultados finais (JSON)
 * GET  /api/export/:id   — export CSV
 */

import { v4 as uuidv4 } from 'uuid';
import { getCached, setCache, createJob, updateJob, getJob } from '../cache/index.js';
import { orchestrateSearch } from '../actors/orchestrator.js';

export async function searchRoutes(fastify) {

  // POST /api/search
  fastify.post('/api/search', {
    schema: {
      body: {
        type: 'object',
        required: ['query', 'location'],
        properties: {
          query: { type: 'string', minLength: 2, maxLength: 100 },
          location: { type: 'string', minLength: 2, maxLength: 100 },
          platforms: { type: 'array', items: { type: 'string' }, default: ['catho', 'vagas', 'indeed', 'curriculos'] },
          limit: { type: 'integer', minimum: 5, maximum: 100, default: 50 },
        },
      },
    },
  }, async (req, reply) => {
    const { query, location, platforms = ['catho', 'vagas', 'indeed', 'curriculos'], limit = 50 } = req.body;

    // Check cache first
    const cached = getCached(query, location, platforms);
    if (cached) {
      const jobId = uuidv4();
      createJob(jobId, query, location, platforms);
      updateJob(jobId, {
        status: 'completed',
        progress: 100,
        message: `${cached.length} candidatos (cache)`,
        results: JSON.stringify(cached),
      });
      return { jobId, cached: true };
    }

    const jobId = uuidv4();
    createJob(jobId, query, location, platforms);

    // Run search async (don't await)
    runSearchAsync(jobId, query, location, platforms, limit).catch(err => {
      console.error('[search] Async error:', err);
      updateJob(jobId, { status: 'error', error: err.message });
    });

    return { jobId, cached: false };
  });

  // GET /api/search/:id/stream — Server-Sent Events
  fastify.get('/api/search/:id/stream', async (req, reply) => {
    const { id } = req.params;

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (data) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    let lastProgress = -1;
    const interval = setInterval(() => {
      const job = getJob(id);
      if (!job) {
        send({ type: 'error', message: 'Job não encontrado' });
        clearInterval(interval);
        reply.raw.end();
        return;
      }

      if (job.progress !== lastProgress) {
        lastProgress = job.progress;
        send({ type: 'progress', progress: job.progress, message: job.message });
      }

      if (job.status === 'completed') {
        send({ type: 'done', progress: 100 });
        clearInterval(interval);
        reply.raw.end();
      } else if (job.status === 'error') {
        send({ type: 'error', message: job.error });
        clearInterval(interval);
        reply.raw.end();
      }
    }, 500);

    req.raw.on('close', () => clearInterval(interval));
  });

  // GET /api/search/:id/results
  fastify.get('/api/search/:id/results', async (req, reply) => {
    const { id } = req.params;
    const job = getJob(id);

    if (!job) return reply.status(404).send({ error: 'Job não encontrado' });
    if (job.status === 'error') return reply.status(500).send({ error: job.error });
    if (job.status !== 'completed') return reply.status(202).send({ status: job.status, progress: job.progress });

    const results = JSON.parse(job.results || '[]');
    return {
      query: job.query,
      location: job.location,
      total: results.length,
      candidates: results,
    };
  });

  // GET /api/export/:id?format=csv
  fastify.get('/api/export/:id', async (req, reply) => {
    const { id } = req.params;
    const { format = 'csv' } = req.query;
    const job = getJob(id);

    if (!job || job.status !== 'completed') {
      return reply.status(404).send({ error: 'Resultados não disponíveis' });
    }

    const results = JSON.parse(job.results || '[]');

    if (format === 'csv') {
      const csv = toCsv(results);
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="candidatos-${job.query.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.csv"`);
      return reply.send('\uFEFF' + csv); // BOM for Excel UTF-8
    }

    return results;
  });

  // GET /api/platforms
  fastify.get('/api/platforms', async () => ({
    platforms: [
      { id: 'catho',      label: 'Catho',      description: 'Candidatos cadastrados no Catho', cost: 'zero' },
      { id: 'vagas',      label: 'Vagas.com',  description: 'Candidatos no Vagas.com', cost: 'zero' },
      { id: 'indeed',     label: 'Indeed',     description: 'Currículos no Indeed Brasil', cost: 'médio' },
      { id: 'curriculos', label: 'Currículos', description: 'Currículos públicos com contato', cost: 'zero' },
    ],
  }));
}

async function runSearchAsync(jobId, query, location, platforms, limit) {
  updateJob(jobId, { status: 'running', progress: 5, message: 'Iniciando busca...' });

  const onProgress = (pct, msg) => {
    updateJob(jobId, { progress: pct, message: msg });
  };

  const results = await orchestrateSearch(query, location, platforms, limit, onProgress);

  setCache(query, location, platforms, results);

  updateJob(jobId, {
    status: 'completed',
    progress: 100,
    message: `${results.length} candidatos encontrados`,
    results: JSON.stringify(results),
  });
}

function toCsv(candidates) {
  const headers = ['#', 'Nome', 'Cargo', 'Cidade', 'Email', 'Telefone', 'Score', 'Plataforma', 'URL'];
  const rows = candidates.map((c, i) => [
    i + 1,
    `"${(c.name     || '').replace(/"/g, '""')}"`,
    `"${(c.title    || '').replace(/"/g, '""')}"`,
    `"${(c.location || '').replace(/"/g, '""')}"`,
    `"${(c.email    || '').replace(/"/g, '""')}"`,
    `"${(c.phone    || '').replace(/"/g, '""')}"`,
    c.score || 0,
    c.platform || '',
    c.url || '',
  ]);
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}