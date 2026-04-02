/**
 * Catho / Vagas.com — via Google Search (custo zero extra)
 *
 * HTTP direto bloqueado. Busca via Google Search.
 */

import { searchGooglePeople } from './google-people.js';
import { ApifyClient } from 'apify-client';

export async function searchCatho(query, location, limit = 20) {
  return searchGooglePeople(query, location, limit, ['catho']);
}

export async function searchVagas(query, location, limit = 15) {
  const client = new ApifyClient({ token: process.env.APIFY_TOKEN });
  const city = location.split(',')[0].trim();

  try {
    const run = await client.actor('nFJndFXA5zjCTuudP').call({
      queries: `site:vagas.com.br "${query}" "${city}"`,
      maxPagesPerQuery: 1,
      languageCode: 'pt',
      countryCode: 'br',
    }, { waitSecs: 60 });

    const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit: 30 });

    return items
      .filter(i => i.url?.includes('vagas.com.br') && i.title)
      .map(i => {
        const clean = i.title.replace(/\s*[-–|]\s*vagas\.com\.br$/i, '').trim();
        const parts = clean.split(/\s*[-–]\s*/);
        return {
          name: parts[0]?.trim() || '',
          title: parts[1]?.trim() || query,
          company: 'Não informado',
          location: city,
          url: i.url,
          platform: 'vagas',
          source: 'google-search',
        };
      })
      .filter(c => c.name && c.name.length > 3)
      .slice(0, limit);
  } catch (err) {
    console.error('[vagas] Search error:', err.message);
    return [];
  }
}
