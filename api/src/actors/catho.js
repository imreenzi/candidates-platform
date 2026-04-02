/**
 * Catho / Vagas.com — via Google Search (custo zero extra)
 *
 * HTTP direto bloqueado (404/anti-bot). Solução: buscar via Google.
 * Este módulo delega ao google-people.js com target catho/vagas.
 */

import { searchGooglePeople } from './google-people.js';

export async function searchCatho(query, location, limit = 20) {
  return searchGooglePeople(query, location, limit, ['catho']);
}

export async function searchVagas(query, location, limit = 15) {
  // Vagas.com — busca geral via Google como fallback
  const { ApifyClient } = await import('apify-client');
  const client = new ApifyClient({ token: process.env.APIFY_TOKEN });
  const city = location.split(',')[0].trim();

  try {
    const run = await client.actor('nFJndFXA5zjCTuudP').call({
      queries: `site:vagas.com.br "${query}" "${city}"`,
      maxPagesPerQuery: 1,
      languageCode: 'pt-BR',
      countryCode: 'br',
    }, { waitSecs: 60 });

    const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit: 30 });

    const candidates = [];
    for (const item of items) {
      const results = item.organicResults || (item.url ? [item] : []);
      for (const i of results) {
        if (!i.url?.includes('vagas.com.br') || !i.title) continue;
        const clean = i.title.replace(/\s*[-–|]\s*vagas\.com\.br$/i, '').trim();
        const parts = clean.split(/\s*[-–]\s*/);
        const name = parts[0]?.trim() || '';
        if (name && name.length > 3) {
          candidates.push({
            name,
            title: parts[1]?.trim() || query,
            company: 'Não informado',
            location: city,
            url: i.url,
            platform: 'vagas',
            source: 'google-search',
          });
        }
      }
    }
    return candidates.slice(0, limit);
  } catch (err) {
    console.error('[vagas] Search error:', err.message);
    return [];
  }
}
