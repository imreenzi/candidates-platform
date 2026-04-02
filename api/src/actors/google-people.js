/**
 * Google People Search Actor
 *
 * Estratégia: site:linkedin.com/in "cargo" "cidade" via Google Search
 * Actor: nFJndFXA5zjCTuudP (71M runs, ~$0.001 per 10 results)
 *
 * É o actor mais barato e eficaz para encontrar candidatos.
 * O snippet do Google contém: nome, cargo, empresa, cidade — sem precisar
 * entrar no LinkedIn.
 */

import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_TOKEN });

/**
 * Extrai dados do candidato a partir de um resultado Google
 * Ex: "João Silva - Ajudante Geral - ABC Corp | LinkedIn"
 *     snippet: "Ajudante Geral at ABC Corp. Mauá, São Paulo, Brasil."
 */
function parseGoogleResult(item) {
  const { title = '', url = '', description = '' } = item;

  if (!url.includes('linkedin.com/in/')) return null;

  // Parse name from title: "Nome Sobrenome - Cargo - Empresa | LinkedIn"
  const titleParts = title.replace(/\s*\|\s*linkedin$/i, '').split(/\s*[-–]\s*/);
  const name = titleParts[0]?.trim() || '';
  const titleFromGoogle = titleParts[1]?.trim() || '';

  // Parse company + location from snippet
  let company = '';
  let location = '';

  const atMatch = description.match(/(?:^|\.\s+)([^.]+?)\s+at\s+([^.]+)/i);
  if (atMatch) {
    location = '';
    company = atMatch[2]?.trim() || '';
  }

  // Location usually appears as "City, State, Country"
  const locMatch = description.match(/([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*,\s*(?:São Paulo|Rio de Janeiro|Minas Gerais|Bahia|Paraná|Rio Grande do Sul|SP|RJ|MG|BA|PR|RS|SC|GO|PE|CE|PA|AM|MA|MS|MT|ES|RN|AL|SE|PI|TO|RO|AC|AP|RR|DF)[^.]*)/)
  if (locMatch) location = locMatch[1]?.trim() || '';

  if (!name || name.length < 3) return null;

  return {
    name,
    title: titleFromGoogle,
    company: company || 'Não informado',
    location: location || 'Brasil',
    url,
    platform: 'linkedin',
    source: 'google-search',
  };
}

/**
 * Constrói queries otimizadas por tipo de vaga
 */
function buildQueries(query, location) {
  const queries = [
    // Primary: exact title + location on LinkedIn
    `site:linkedin.com/in "${query}" "${location}"`,
    // Fallback: title only on LinkedIn
    `site:linkedin.com/in "${query}" Brasil`,
  ];

  // For blue-collar: also search without quotes for broader match
  if (query.length < 25) {
    queries.push(`site:linkedin.com/in ${query} ${location.split(',')[0]}`);
  }

  return queries.slice(0, 2); // max 2 queries to control cost
}

export async function searchGooglePeople(query, location, limit = 20) {
  const queries = buildQueries(query, location);
  const allCandidates = [];

  for (const searchQuery of queries) {
    if (allCandidates.length >= limit) break;

    try {
      const run = await client.actor('nFJndFXA5zjCTuudP').call({
        queries: searchQuery,
        maxPagesPerQuery: 2,
        resultsPerPage: Math.min(10, limit - allCandidates.length),
        mobileResults: false,
        languageCode: 'pt',
        countryCode: 'BR',
        customDataFunction: `async ({ input, $, request, response, html }) => {
          return {
            url: request.url,
            query: input.queries,
          };
        }`,
      }, { waitSecs: 60 });

      const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit: 50 });

      for (const item of items) {
        const candidate = parseGoogleResult(item);
        if (candidate) {
          // Dedup by URL
          if (!allCandidates.find(c => c.url === candidate.url)) {
            allCandidates.push(candidate);
          }
        }
      }
    } catch (err) {
      console.error('[google-people] Actor error:', err.message);
    }
  }

  return allCandidates.slice(0, limit);
}
