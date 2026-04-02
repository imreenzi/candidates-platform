/**
 * Scoring engine — pontua candidatos por relevância.
 *
 * Critérios:
 *   Title match      0-50 pts
 *   Location match   0-20 pts
 *   Contact info     0-20 pts  ← email/telefone disponíveis
 *   Data quality     0-10 pts
 */

const TITLE_NORMALIZATION = {
  'ajudante geral': ['ajudante geral', 'helper', 'auxiliar geral'],
  'auxiliar de produção': ['auxiliar de producao', 'auxiliar produção', 'operador de produção', 'ajudante de produção'],
  'motorista': ['motorista', 'driver', 'entregador', 'condutor'],
  'operador de caixa': ['operador de caixa', 'caixa', 'atendente de caixa'],
  'desenvolvedor': ['desenvolvedor', 'developer', 'engenheiro de software', 'programador', 'dev'],
  'vendedor': ['vendedor', 'sales', 'consultor de vendas', 'representante comercial'],
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

  if (!ct) return 0;
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
  if (overlap > 0) return Math.round(30 * (overlap / Math.max(sqWords.length, 1)));

  return 0;
}

function scoreLocation(candidateLocation, searchLocation) {
  if (!candidateLocation || !searchLocation) return 6;

  const cl = normalize(candidateLocation);
  const sl = normalize(searchLocation);

  if (cl === sl) return 20;
  if (cl.includes(sl) || sl.includes(cl)) return 18;

  const searchCity = normalize(sl.split(',')[0].trim());
  const candCity = normalize(cl.split(',')[0].trim());

  if (cl.includes(searchCity) || candCity.includes(searchCity)) return 16;
  if (searchCity.includes(candCity) && candCity.length > 3) return 14;

  const stateMatch = sl.match(/,\s*([a-z]{2})$/i);
  if (stateMatch && cl.includes(normalize(stateMatch[1]))) return 8;

  if (cl.includes('brasil') || cl.includes('brazil')) return 6;
  return 4;
}

function scoreContact(candidate) {
  let score = 0;
  if (candidate.email) score += 12;
  if (candidate.phone) score += 8;
  return score;
}

function scoreDataQuality(candidate) {
  let score = 0;
  if (candidate.url) score += 4;
  if (candidate.name && candidate.name.split(' ').length >= 2) score += 3;
  if (candidate.title) score += 3;
  return Math.min(score, 10);
}

export function scoreCandidate(candidate, searchQuery, searchLocation) {
  const total =
    scoreTitle(candidate.title, searchQuery) +
    scoreLocation(candidate.location, searchLocation) +
    scoreContact(candidate) +
    scoreDataQuality(candidate);
  return Math.min(Math.round(total), 100);
}

export function scoreAndRank(candidates, searchQuery, searchLocation) {
  return candidates
    .map(c => ({ ...c, score: scoreCandidate(c, searchQuery, searchLocation) }))
    .filter(c => c.score >= 10)
    .sort((a, b) => b.score - a.score);
}