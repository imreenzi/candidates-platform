/**
 * Google Search Actor — busca candidatos ATIVOS buscando emprego
 *
 * Foca em: Catho, Vagas.com, Indeed resumes, currículos públicos
 * Extrai: email e telefone quando disponível no snippet do Google
 */

import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_TOKEN });

// ─── Extractors ─────────────────────────────────────────────────────────────────────────────

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,4}/;
const PHONE_RE = /(?:\+?55[\s-]?)?(?:\(?\d{2}\)?[\s-]?)(?:9[\s-]?)?\d{4}[\s-]?\d{4}/;

function extractEmail(text) {
  const m = (text || '').match(EMAIL_RE);
  return m ? m[0].toLowerCase() : null;
}

function extractPhone(text) {
  const m = (text || '').match(PHONE_RE);
  if (!m) return null;
  const digits = m[0].replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 13) return null;
  return m[0].trim();
}

function extractLocation(text) {
  const m = (text || '').match(/([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*),\s*((?:São Paulo|Rio de Janeiro|Minas Gerais|Bahia|Paraná|Rio Grande do Sul|Santa Catarina|Goiás|Pernambuco|Ceará|Pará|Amazonas|Maranhão|Mato Grosso|Espírito Santo|Rio Grande do Norte|Alagoas|Sergipe|Piauí|Tocantins|Rondônia|Acre|Amapá|Roraima|Distrito Federal|SP|RJ|MG|BA|PR|RS|SC|GO|PE|CE|PA|AM|MA|MS|MT|ES|RN|AL|SE|PI|TO|RO|AC|AP|RR|DF))/);
  return m ? `${m[1]}, ${m[2]}` : null;
}

function nameFromSlug(url) {
  const segments = (url || '').replace(/https?:\/\/[^/]+/, '').split('/').filter(Boolean);
  for (const seg of segments) {
    const clean = seg
      .replace(/[-_]\d{4,}$/, '')
      .replace(/\.\w+$/, '');
    const parts = clean.split(/[-_]/).filter(p => p.length > 1 && !/^\d+$/.test(p));
    if (parts.length >= 2 && parts.length <= 5 && parts[0].length > 1) {
      return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
    }
  }
  return '';
}

// ─── Parsers by platform ────────────────────────────────────────────────────────────────────────

function parseResult(item) {
  const { title = '', url = '', description = '' } = item;
  if (!url || !title) return null;

  const combined = title + ' ' + description;
  const email = extractEmail(combined);
  const phone = extractPhone(description);

  if (url.includes('catho.com.br'))                return parseCatho(title, url, description, email, phone);
  if (url.includes('vagas.com.br'))                return parseVagas(title, url, description, email, phone);
  if (url.includes('indeed.com'))                   return parseIndeed(title, url, description, email, phone);
  if (url.includes('curriculum.com.br') ||
      url.includes('curriculo.') ||
      url.includes('meucurriculo.') ||
      url.includes('curriculos.'))                  return parseCurriculum(title, url, description, email, phone);

  // Accept any result that has contact info
  if (email || phone) return parseGeneric(title, url, description, email, phone);

  return null;
}

function parseCatho(title, url, description, email, phone) {
  const clean = title.replace(/\s*[-–|]\s*catho.*$/i, '').trim();
  const parts = clean.split(/\s*[-–]\s+/);
  const name = parts[0]?.trim() || nameFromSlug(url);
  const jobTitle = (parts[1] || '').replace(/\s+em\s+.+$/, '').trim();
  const location = extractLocation(title + ' ' + description) || 'Brasil';
  if (!name || name.length < 3) return null;
  return { name, title: jobTitle, company: '', location, email, phone, url, platform: 'catho', source: 'google-search' };
}

function parseVagas(title, url, description, email, phone) {
  const clean = title.replace(/\s*[-–|]\s*vagas\.com.*$/i, '').trim();
  const parts = clean.split(/\s*[-–]\s+/);
  const name = parts[0]?.trim() || nameFromSlug(url);
  const jobTitle = (parts[1] || '').trim();
  const location = extractLocation(title + ' ' + description) || 'Brasil';
  if (!name || name.length < 3) return null;
  return { name, title: jobTitle, company: '', location, email, phone, url, platform: 'vagas', source: 'google-search' };
}

function parseIndeed(title, url, description, email, phone) {
  const clean = title.replace(/\s*[-–|]\s*indeed.*$/i, '').trim();
  const parts = clean.split(/\s*[-–]\s+/);
  const name = parts[0]?.trim() || nameFromSlug(url);
  const jobTitle = (parts[1] || '').trim();
  const location = extractLocation(title + ' ' + description) || 'Brasil';
  if (!name || name.length < 3) return null;
  return { name, title: jobTitle, company: '', location, email, phone, url, platform: 'indeed', source: 'google-search' };
}

function parseCurriculum(title, url, description, email, phone) {
  const clean = title.replace(/\s*[-–|]\s*(curriculum|currículo|curriculo).*$/i, '').trim();
  const parts = clean.split(/\s*[-–]\s+/);
  const name = parts[0]?.trim() || nameFromSlug(url);
  const jobTitle = (parts[1] || '').trim();
  const location = extractLocation(title + ' ' + description) || 'Brasil';
  if (!name || name.length < 3) return null;
  return { name, title: jobTitle, company: '', location, email, phone, url, platform: 'curriculo', source: 'google-search' };
}

function parseGeneric(title, url, description, email, phone) {
  const clean = title.split(/\s*[|–-]\s*/)[0].trim();
  if (!clean || clean.length < 3) return null;
  const location = extractLocation(description) || 'Brasil';
  return { name: clean, title: '', company: '', location, email, phone, url, platform: 'google', source: 'google-search' };
}

// ─── Query builder ───────────────────────────────────────────────────────────────────────────────

export function buildQueries(query, location, platforms) {
  const city = location.split(',')[0].trim();
  const all = !platforms.length;
  const queries = [];

  if (all || platforms.includes('catho')) {
    queries.push(`site:catho.com.br "${query}" "${city}"`);
  }
  if (all || platforms.includes('vagas')) {
    queries.push(`site:vagas.com.br "${query}" "${city}"`);
  }
  if (all || platforms.includes('indeed')) {
    queries.push(`site:br.indeed.com/r "${query}" "${city}"`);
  }
  if (all || platforms.includes('curriculos')) {
    queries.push(`"${query}" "${city}" currículo email telefone`);
    queries.push(`"${query}" "${city}" "procurando emprego" OR "em busca de oportunidade"`);
  }

  if (!queries.length) {
    queries.push(`site:catho.com.br "${query}" "${city}"`);
  }

  return queries;
}

// ─── Main ─────────────────────────────────────────────────────────────────────────────────

export async function searchGooglePeople(query, location, limit = 20, platforms = []) {
  const queries = buildQueries(query, location, platforms);
  const allCandidates = [];
  const seenUrls = new Set();

  for (const searchQuery of queries) {
    if (allCandidates.length >= limit) break;

    try {
      const run = await client.actor('nFJndFXA5zjCTuudP').call({
        queries: searchQuery,
        maxPagesPerQuery: 3,
        languageCode: 'pt-BR',
        countryCode: 'br',
      }, { waitSecs: 120 });

      const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit: 100 });

      for (const item of items) {
        const results = item.organicResults || (item.url ? [item] : []);
        for (const result of results) {
          const candidate = parseResult(result);
          if (candidate && !seenUrls.has(candidate.url)) {
            seenUrls.add(candidate.url);
            allCandidates.push(candidate);
          }
        }
      }
    } catch (err) {
      console.error('[google-search] Actor error:', err.message);
    }
  }

  return allCandidates.slice(0, limit);
}