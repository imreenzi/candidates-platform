# Claw Candidates — Plataforma Nacional de Busca de Talentos

Busca candidatos em múltiplas plataformas via Apify. Qualquer nicho, cobertura nacional.

## Stack

- **Backend**: Node.js + Fastify (API REST + SSE)
- **Scraping**: Apify (Google Search, LinkedIn, Indeed)
- **BR Direto**: Catho, Vagas.com (HTTP, custo zero)
- **Cache**: SQLite (24h TTL)
- **Frontend**: Vanilla JS/CSS
- **Deploy**: Digital Ocean App Platform

## Rodando local

```bash
cd api
cp .env.example .env   # preencha com sua API key Apify
npm install
npm run dev
# Acesse: http://localhost:3001
```

## Actors Apify usados

| Actor ID | Plataforma | Custo/busca | Quando usar |
|----------|-----------|-------------|-------------|
| `nFJndFXA5zjCTuudP` | Google Search | ~$0.001 | Sempre — base |
| `hMvNSpz3JnHgl5jkh` | Indeed | ~$0.05-0.10 | Vagas industriais/blue-collar |
| `e1xYKjtHLG2Js5YdC` | LinkedIn Profile | ~$0.10-0.50 | Profissional/tech |
| — | Catho/Vagas HTTP | $0.00 | Sempre (sem actor) |

## Estratégia por tipo de vaga

| Tipo | Plataformas ativas |
|------|--------------------|
| Blue-collar (ajudante, operador) | Google → Indeed → Catho → Vagas |
| Tech (dev, analista) | Google → LinkedIn → Indeed |
| Comercial (vendedor, atendente) | Google → Indeed → Catho |
| Profissional (gerente, analista) | Google → LinkedIn → Indeed |

## API Endpoints

```
POST /api/search              — inicia busca, retorna { jobId }
GET  /api/search/:id/stream  — SSE de progresso
GET  /api/search/:id/results — resultados JSON
GET  /api/export/:id          — CSV com BOM (Excel)
GET  /api/platforms           — plataformas disponíveis
GET  /health                  — status
```

## Deploy Digital Ocean

```bash
doctl auth init
doctl apps create --spec .do/app.yaml
# Depois setar o token:
doctl apps update <APP_ID> --set-env APIFY_TOKEN=<seu-token>
```
