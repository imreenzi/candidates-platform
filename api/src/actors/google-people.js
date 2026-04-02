/**
 * Google Search Actor — busca candidatos via Google SERP
 *
 * Actor: nFJndFXA5zjCTuudP (~$0.001 per 10 results)
 * Estratégia unificada: usar Google para encontrar perfis em TODAS as plataformas.
 *
 * Queries por plataforma:
 *   LinkedIn: site:linkedin.com/in "cargo" "cidade"
 *   Catho:    site:catho.com.br "cargo" "cidade"
 *   Indeed:   site:br.indeed.com/r "cargo" "cidade"
 */

import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_TOKEN });

/**
 * Detecta plataforma e extrai dados do resultado Google
 */
function parseGoogleResult(item) {
  const { title = '', url = '', description = '' } = item;
  if (!url || !title) return null;

  if (url.includes('linkedin.com/in/')) {
    return parseLinkedIn(title, url, description);
  }
  if (url.includes('catho.com.br')) {
    return parseCatho(title, url, description);
  }
  if (url.includes('indeed.com')) {
    return parseIndeed(title, url, description);
  }

  return null;
}

function parseLinkedIn(title, url, description) {
  const clean = title.replace(/\s*\|\s*linkedin$/i, '').trim();
  const parts = clean.split(/\s*[-–]\s*/);
  const name = parts[0]?.trim() || '';
  const jobTitle = parts[1]?.trim() || '';

  let company = 'Não informado';
  const atMatch = description.match(/\bat\s+([^.]+)/i);
  if (atMatch) company = atMatch[1].trim().replace(/\.$/, '');

  const location = extractLocation(description) || 'Brasil';

  if (!name || name.length < 3) return null;
  return { name, title: jobTitle, company, location, url, platform: 'linkedin', source: 'google-search' };
}

function parseCatho(title, url, description) {
  const clean = title.replace(/\s*[-–]\s*catho$/i, '').replace(/\s*\|\s*catho$/i, '').trim();
  const parts = clean.split(/\s*[-–]\s*/);
  const name = parts[0]?.trim() || '';
  const jobTitle = (parts[1] || '').replace(/\s+em\s+.+$/, '').trim();
  const location = extractLocation(title + ' ' + description) || 'Brasil';

  if (!name || name.length < 3) return null;
  return { name, title: jobTitle, company: 'Não informado', location, url, platform: 'catho', source: 'google-search' };
}

function parseIndeed(title, url, description) {
  const clean = title.replace(/\s*[-–]\s*indeed$/i, '').replace(/\s*\|\s*indeed$/i, '').trim();
  const parts = clean.split(/\s*[-–]\s*/);
  const name = parts[0]?.trim() || '';
  const jobTitle = parts[1]?.trim() || '';
  const location = extractLocation(title + ' ' + description) || 'Brasil';

  if (!name || name.length < 3) return null;
  return { name, title: jobTitle, company: 'Não informado', location, url, platform: 'indeed', source: 'google-search' };
}

function extractLocation(text) {
  const m = text.match(/([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*),\s*((?:São Paulo|Rio de Janeiro|Minas Gerais|Bahia|Paraná|Rio Grande do Sul|Santa Catarina|Goiás|Pernambuco|Ceará|Pará|Amazonas|Maranhão|Mato Grosso|Espírito Santo|Rio Grande do Norte|Alagoas|Sergipe|Piauí|Tocantins|Rondônia|Acre|Amapá|Roraima|Distrito Federal|SP|RJ|MG|BA|PR|RS|SC|GO|PE|CE|PA|AM|MA|MS|MT|ES|RN|AL|SE|PI|TO|RO|AC|AP|RR|DF))/);
  return m ? `${m[1]}, ${m[2]}` : null;
}

function buildQueries(query, location, platforms) {
  const city = location.split(',')[0].trim();
  const queries = [];

  if (platforms.includes('linkedin')) {
    queries.push(`site:linkedin.com/in "${query}" "${city}"`);
  }
  if (platforms.includes('catho')) {
    queries.push(`site:catho.com.br "${query}" "${city}"`);
  }
  if (platforms.includes('indeed')) {
    queries.push(`site:br.indeed.com "${query}" "${city}"`);
  }
  if (!queries.length) {
    queries.push(`site:linkedin.com/in "${query}" "${city}"`);
  }

  return queries;
}

export async function searchGooglePeople(query, location, limit = 20, platforms = ['linkedin']) {
  const queries = buildQueries(query, location, platforms);
  const allCandidates = [];
  const seenUrls = new Set();

  for (const searchQuery of queries) {
    if (allCandidates.length >= limit) break;

    try {
      const run = await client.actor('nFJndFXA5zjCTuudP').call({
        queries: searchQuery,
        maxPagesPerQuery: 2,
        languageCode: 'pt',
        countryCode: 'br',
      }, { waitSecs: 90 });

      const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit: 50 });

      for (const item of items) {
        const candidate = parseGoogleResult(item);
        if (candidate && !seenUrls.has(candidate.url)) {
          seenUrls.add(candidate.url);
          allCandidates.push(candidate);
        }
      }
    } catch (err) {
      console.error('[google-search] Actor error:', err.message);
    }
  }

  return allCandidates.slice(0, limit);
}
