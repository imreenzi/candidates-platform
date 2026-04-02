/**
 * Indeed Scraper
 *
 * Actor: hMvNSpz3JnHgl5jkh (1.18M runs) — mais popular
 * Estratégia dupla:
 *   1. Indeed Resume Search: indeed.com.br/resumes — pessoas que postaram currículo
 *   2. Indeed Jobs: encontrar vagas similares → inferir candidatos ativos
 *
 * Indeed BR tem banco de currículos público em:
 * https://www.indeed.com.br/resumes?q={query}&l={location}
 */

import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_TOKEN });

/**
 * Extrai candidatos de resultados Indeed Resume
 */
function parseIndeedResume(item) {
  return {
    name: item.name || item.title?.replace(/\s*-.*$/, '') || '',
    title: item.jobTitle || item.headline || item.title || '',
    company: item.currentCompany || item.company || 'Não informado',
    location: item.location || item.city || 'Brasil',
    url: item.url || item.link || '',
    platform: 'indeed',
    source: 'indeed-resume',
  };
}

/**
 * Busca currículos no Indeed
 * URL: https://www.indeed.com.br/resumes?q=cargo&l=cidade
 */
export async function searchIndeedResumes(query, location, limit = 20) {
  const city = location.split(',')[0].trim();
  const resumeUrl = `https://www.indeed.com.br/resumes?q=${encodeURIComponent(query)}&l=${encodeURIComponent(city)}`;

  try {
    const run = await client.actor('hMvNSpz3JnHgl5jkh').call({
      startUrls: [{ url: resumeUrl }],
      maxItems: limit,
      proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
    }, { waitSecs: 90 });

    const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit });

    return items
      .map(parseIndeedResume)
      .filter(c => c.name && c.name.length > 2);
  } catch (err) {
    console.error('[indeed] Resume search error:', err.message);
    return [];
  }
}

/**
 * Busca vagas no Indeed → extrai empresa/cargo para complementar busca
 * Usado para inferir quais empresas contratam esse perfil
 */
export async function searchIndeedJobs(query, location, limit = 15) {
  const city = location.split(',')[0].trim();

  try {
    const run = await client.actor('hMvNSpz3JnHgl5jkh').call({
      position: query,
      country: 'BR',
      location: city,
      maxItems: limit,
      startUrls: [],
    }, { waitSecs: 90 });

    const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit });

    return items.map(item => ({
      company: item.company || item.companyName || '',
      location: item.location || city,
      jobTitle: item.positionName || item.title || query,
      platform: 'indeed',
      source: 'indeed-jobs',
      isJobListing: true,
    })).filter(i => i.company);
  } catch (err) {
    console.error('[indeed] Jobs search error:', err.message);
    return [];
  }
}
