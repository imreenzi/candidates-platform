/**
 * Scoring engine — pontua candidatos por relevância.
 */

const TITLE_NORMALIZATION = {
  'ajudante geral': ['ajudante geral', 'helper', 'auxiliar geral', 'geral'],
  'auxiliar de produção': ['auxiliar de producao', 'auxiliar produção', 'aux produção', 'operador de produção', 'ajudante de produção'],
  'motorista': ['motorista', 'driver', 'entregador', 'condutor'],
  'operador de caixa': ['operador de caixa', 'caixa', 'atendente de caixa', 'checkout'],
  'desenvolvedor': ['desenvolvedor', 'developer', 'engenheiro de software', 'programador', 'dev'],
  'vendedor': ['vendedor', 'sales', 'consultor de vendas', 'representante comercial'],
};

const PLATFORM_TRUST = {
  linkedin: 10,
  indeed: 8,
  catho: 9,
  vagas: 7,
  empregos: 6,
  google: 5,
};

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function scoreTitle(candidateTitle, searchQuery) {
  const ct = normalize(candidateTitle);
  const sq = normalize(searchQuery);

  if (!ct) return 10; // sem título = neutro
  if (ct === sq) return 50;
  if (ct.includes(sq)) return 45;
  if (sq.includes(ct)) return 40;

  for (const [canonical, synonyms] of Object.entries(TITLE_NORMALIZATION)) {
    const normCanonical = normalize(canonical);
    const inQuery = sq.includes(normCanonical) || synonyms.some(s => sq.includes(normalize(s)));
    const inTitle = ct.includes(normCanonical) || synonyms.some(s => ct.includes(normalize(s)));
    if (inQuery && inTitle) return 42;
  }

  const sqWords = sq.split(/\s+/).filter(w => w.length > 2);
  const ctWords = ct.split(/\s+/).filter(w => w.length > 2);
  const overlap = sqWords.filter(w => ctWords.includes(w)).length;
  if (overlap > 0) {
    return Math.round(30 * (overlap / Math.max(sqWords.length, 1)));
  }

  return 10;
}

function scoreLocation(candidateLocation, searchLocation) {
  if (!candidateLocation || !searchLocation) return 8;

  const cl = normalize(candidateLocation);
  const sl = normalize(searchLocation);

  if (cl === sl) return 25;
  if (cl.includes(sl) || sl.includes(cl)) return 22;

  const searchCity = normalize(sl.split(',')[0].trim());
  const candCity = normalize(cl.split(',')[0].trim());

  if (cl.includes(searchCity) || candCity.includes(searchCity)) return 20;
  if (searchCity.includes(candCity) && candCity.length > 3) return 18;

  const stateMatch = sl.match(/,\s*([a-z]{2})$/i);
  if (stateMatch) {
    const state = normalize(stateMatch[1]);
    if (cl.includes(state)) return 12;
  }

  if (cl.includes('brasil') || cl.includes('brazil')) return 8;

  return 5;
}

function scoreDataQuality(candidate) {
  let score = 0;
  if (candidate.company && candidate.company !== 'Não informado') score += 5;
  if (candidate.url) score += 4;
  if (candidate.name && candidate.name.split(' ').length >= 2) score += 3;
  if (candidate.title) score += 3;
  return Math.min(score, 15);
}

export function scoreCandidate(candidate, searchQuery, searchLocation) {
  const titleScore = scoreTitle(candidate.title, searchQuery);
  const locationScore = scoreLocation(candidate.location, searchLocation);
  const qualityScore = scoreDataQuality(candidate);
  const platformScore = PLATFORM_TRUST[candidate.platform] || 5;

  return Math.min(Math.round(titleScore + locationScore + qualityScore + platformScore), 100);
}

export function scoreAndRank(candidates, searchQuery, searchLocation) {
  return candidates
    .map(c => ({ ...c, score: scoreCandidate(c, searchQuery, searchLocation) }))
    .filter(c => c.score >= 15)
    .sort((a, b) => b.score - a.score);
}
