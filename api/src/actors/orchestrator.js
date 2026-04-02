/**
 * Orchestrator — coordena busca por plataforma
 *
 * Estratégia unificada de custo mínimo:
 *   Google Search actor cobre LinkedIn, Catho, Indeed via queries específicas.
 */

import { searchGooglePeople } from './google-people.js';
import { scoreAndRank } from '../scoring/index.js';

const JOB_CATEGORIES = {
  blue_collar: [
    'ajudante', 'auxiliar', 'operador', 'servente', 'pedreiro', 'eletricista',
    'mecânico', 'motorista', 'entregador', 'estoquista', 'almoxarife',
    'zelador', 'porteiro', 'vigia', 'segurança', 'faxineiro', 'limpeza',
    'cozinheiro', 'copeiro', 'garçom', 'motoboy', 'office boy', 'soldador',
    'pintor', 'carpinteiro', 'encanador', 'jardineiro', 'lavador',
  ],
  tech: [
    'desenvolvedor', 'developer', 'engenheiro de software', 'programador',
    'analista de sistemas', 'devops', 'data science', 'machine learning',
    'frontend', 'backend', 'fullstack', 'mobile', 'qa engineer', 'ti',
  ],
  professional: [
    'gerente', 'analista', 'coordenador', 'supervisor', 'diretor',
    'consultor', 'especialista', 'contador', 'advogado', 'médico',
    'enfermeiro', 'professor', 'arquiteto', 'engenheiro', 'rh',
  ],
  commercial: [
    'vendedor', 'representante', 'consultor de vendas', 'promotor',
    'atendente', 'recepcionista', 'telemarketing', 'sdr', 'closer',
  ],
};

function detectCategory(query) {
  const q = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [cat, keywords] of Object.entries(JOB_CATEGORIES)) {
    if (keywords.some(k => q.includes(k.normalize('NFD').replace(/[\u0300-\u036f]/g, '')))) {
      return cat;
    }
  }
  return 'general';
}

const CATEGORY_PLATFORMS = {
  blue_collar: ['linkedin', 'catho', 'indeed'],
  tech:        ['linkedin'],
  professional:['linkedin', 'catho'],
  commercial:  ['linkedin', 'catho', 'indeed'],
  general:     ['linkedin', 'catho', 'indeed'],
};

function dedup(candidates) {
  const seen = new Set();
  return candidates.filter(c => {
    const key = c.url || `${c.name?.toLowerCase()}|${c.title?.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function orchestrateSearch(query, location, requestedPlatforms, limit, onProgress) {
  const category = detectCategory(query);
  const allCandidates = [];

  const platformPriority = CATEGORY_PLATFORMS[category] || CATEGORY_PLATFORMS.general;
  const activePlatforms = requestedPlatforms.length
    ? platformPriority.filter(p => requestedPlatforms.includes(p) || requestedPlatforms.includes('google') || requestedPlatforms.includes('all'))
    : platformPriority;

  onProgress(5, `Categoria: ${category} — plataformas: ${activePlatforms.join(', ')}`);

  // LinkedIn
  if (activePlatforms.includes('linkedin') || requestedPlatforms.includes('google')) {
    onProgress(15, 'Buscando perfis LinkedIn...');
    try {
      const results = await searchGooglePeople(query, location, Math.ceil(limit * 0.5), ['linkedin']);
      allCandidates.push(...results);
      onProgress(40, `${results.length} perfis LinkedIn encontrados`);
    } catch (err) {
      console.error('[orchestrator] LinkedIn error:', err.message);
      onProgress(40, 'LinkedIn: erro, continuando...');
    }
  }

  // Catho
  if (activePlatforms.includes('catho') || requestedPlatforms.includes('catho')) {
    onProgress(50, 'Buscando perfis Catho...');
    try {
      const results = await searchGooglePeople(query, location, Math.ceil(limit * 0.3), ['catho']);
      allCandidates.push(...results);
      onProgress(70, `${results.length} perfis Catho encontrados`);
    } catch (err) {
      console.error('[orchestrator] Catho error:', err.message);
      onProgress(70, 'Catho: erro, continuando...');
    }
  }

  // Indeed
  if (activePlatforms.includes('indeed') || requestedPlatforms.includes('indeed')) {
    onProgress(75, 'Buscando perfis Indeed...');
    try {
      const results = await searchGooglePeople(query, location, Math.ceil(limit * 0.3), ['indeed']);
      allCandidates.push(...results);
      onProgress(88, `${results.length} perfis Indeed encontrados`);
    } catch (err) {
      console.error('[orchestrator] Indeed error:', err.message);
      onProgress(88, 'Indeed: erro, continuando...');
    }
  }

  onProgress(92, 'Deduplicando e pontuando...');
  const deduped = dedup(allCandidates);
  const ranked = scoreAndRank(deduped, query, location);

  onProgress(100, `${ranked.length} candidatos encontrados`);
  return ranked.slice(0, limit);
}
