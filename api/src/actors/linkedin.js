/**
 * LinkedIn People Profile Scraper
 *
 * Actor: e1xYKjtHLG2Js5YdC (97k runs)
 * Uso: enriquecimento de perfis já encontrados via Google,
 *      ou busca direta quando Google não retorna resultados suficientes.
 *
 * CUSTO: maior que Google — usar apenas quando necessário.
 */

import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_TOKEN });

/**
 * Enriquece uma lista de URLs LinkedIn com dados completos
 */
export async function enrichLinkedInProfiles(urls) {
  if (!urls.length) return [];

  try {
    const run = await client.actor('e1xYKjtHLG2Js5YdC').call({
      profileUrls: urls.map(url => ({ url })),
      proxyConfiguration: { useApifyProxy: true },
    }, { waitSecs: 120 });

    const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit: urls.length });

    return items.map(item => ({
      name: item.fullName || item.name || '',
      title: item.headline || item.title || '',
      company: item.currentCompany || item.company || 'Não informado',
      location: item.location || item.addressWithCountry || 'Brasil',
      url: item.linkedInUrl || item.profileUrl || '',
      platform: 'linkedin',
      source: 'linkedin-profile',
      connections: item.connectionsCount || null,
    })).filter(c => c.name);
  } catch (err) {
    console.error('[linkedin] Actor error:', err.message);
    return [];
  }
}

/**
 * Busca direta por pessoas no LinkedIn via URL de pesquisa
 */
export async function searchLinkedInPeople(query, location, limit = 20) {
  const searchUrl = buildLinkedInSearchUrl(query, location);

  try {
    const run = await client.actor('e1xYKjtHLG2Js5YdC').call({
      startUrls: [{ url: searchUrl }],
      maxResults: limit,
      proxyConfiguration: { useApifyProxy: true },
    }, { waitSecs: 120 });

    const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit });

    return items.map(item => ({
      name: item.fullName || item.name || '',
      title: item.headline || '',
      company: item.currentCompany || 'Não informado',
      location: item.location || 'Brasil',
      url: item.linkedInUrl || '',
      platform: 'linkedin',
      source: 'linkedin-direct',
    })).filter(c => c.name && c.url);
  } catch (err) {
    console.error('[linkedin] Search error:', err.message);
    return [];
  }
}

function buildLinkedInSearchUrl(query, location) {
  const params = new URLSearchParams({
    keywords: query,
    origin: 'GLOBAL_SEARCH_HEADER',
  });

  const city = location.split(',')[0].trim();
  return `https://www.linkedin.com/search/results/people/?${params}&geoUrn=&location=${encodeURIComponent(city)}`;
}
