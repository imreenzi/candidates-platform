/**
 * Catho / Vagas.com / Empregos.com.br — Scraper HTTP Direto
 *
 * SEM actor Apify (custo zero).
 * Faz requests HTTP diretamente para as APIs públicas dos portais BR.
 *
 * Catho tem o maior banco de currículos do Brasil para blue-collar.
 */

function parseCathoCandidate(item) {
  return {
    name: item.name || item.nome || '',
    title: item.cargo || item.position || item.titulo || '',
    company: item.empresa || item.company || 'Não informado',
    location: item.cidade || item.location || 'Brasil',
    url: item.url || item.perfil_url || '',
    platform: 'catho',
    source: 'catho-http',
  };
}

export async function searchCatho(query, location, limit = 20) {
  const city = location.split(',')[0].trim();
  const state = (location.split(',')[1] || '').trim().replace(/\s/g, '') || 'SP';

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'pt-BR,pt;q=0.9',
    'Origin': 'https://www.catho.com.br',
    'Referer': 'https://www.catho.com.br/',
  };

  try {
    const params = new URLSearchParams({
      q: query,
      local: `${city}, ${state}`,
      page: '1',
      per_page: String(limit),
    });

    const res = await fetch(`https://www.catho.com.br/candidatos/pesquisa?${params}`, { headers });
    if (!res.ok) throw new Error(`Catho HTTP ${res.status}`);

    const html = await res.text();
    const candidates = extractCathoFromHtml(html, query, city);
    return candidates.slice(0, limit);
  } catch (err) {
    console.error('[catho] HTTP error:', err.message);
    return [];
  }
}

function extractCathoFromHtml(html, query, city) {
  const candidates = [];

  const jsonMatch = html.match(/__NEXT_DATA__\s*=\s*({.+?})\s*<\/script>/s) ||
                    html.match(/window\.__data\s*=\s*({.+?});\s*<\/script>/s);

  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[1]);
      const results = findNestedArray(data, ['candidates', 'curriculums', 'items', 'results']);
      if (results?.length) {
        return results.map(parseCathoCandidate).filter(c => c.name);
      }
    } catch {}
  }

  // Fallback: parse HTML for candidate cards
  const namePattern = /<[^>]+class="[^"]*(?:candidate|candidato|name|nome)[^"]*"[^>]*>([^<]+)</gi;
  let match;
  while ((match = namePattern.exec(html)) !== null && candidates.length < 20) {
    const name = match[1].trim();
    if (name.length > 3 && name.match(/[A-ZÀ-Ú][a-zà-ú]+\s+[A-ZÀ-Ú]/)) {
      candidates.push({
        name,
        title: query,
        company: 'Não informado',
        location: `${city}, Brasil`,
        url: 'https://www.catho.com.br/candidatos',
        platform: 'catho',
        source: 'catho-http',
      });
    }
  }

  return candidates;
}

export async function searchVagas(query, location, limit = 15) {
  const city = location.split(',')[0].trim();

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'pt-BR,pt;q=0.9',
  };

  try {
    const params = new URLSearchParams({ q: query, l: city, pg: '1' });

    const res = await fetch(`https://www.vagas.com.br/candidatos?${params}`, { headers, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`Vagas HTTP ${res.status}`);

    const html = await res.text();
    return extractVagasFromHtml(html, query, city).slice(0, limit);
  } catch (err) {
    console.error('[vagas] HTTP error:', err.message);
    return [];
  }
}

function extractVagasFromHtml(html, query, city) {
  const candidates = [];

  const jsonMatch = html.match(/__NEXT_DATA__\s*=\s*({.+?})\s*<\/script>/s);
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[1]);
      const results = findNestedArray(data, ['candidates', 'items', 'results', 'data']);
      if (results?.length) {
        return results.map(item => ({
          name: item.name || item.nome || '',
          title: item.cargo || item.position || query,
          company: item.empresa || 'Não informado',
          location: item.cidade || city,
          url: item.url || '',
          platform: 'vagas',
          source: 'vagas-http',
        })).filter(c => c.name);
      }
    } catch {}
  }

  return candidates;
}

function findNestedArray(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (const key of keys) {
    if (obj[key]) {
      if (Array.isArray(obj[key])) return obj[key];
      return findNestedArray(obj[key], keys);
    }
  }
  for (const val of Object.values(obj)) {
    if (typeof val === 'object') {
      const found = findNestedArray(val, keys);
      if (found) return found;
    }
  }
  return null;
}
