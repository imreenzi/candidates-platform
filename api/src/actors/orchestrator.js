/**
 * Orchestrator — coordena busca por plataforma
 *
 * Estratégia unificada de custo mínimo:
 *   Google Search actor cobre LinkedIn, Catho, Indeed via queries específicas.
 *   Uma chamada por plataforma = custo ~$0.001 por query.
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

/**
 * Plataformas por categoria (ordem de relevância)
 */
const CATEGORY_PLATFORMS = {
  blue_collar: ['google', 'catho', 'indeed'],
  tech:        ['google', 'linkedin'],
  professional:['google', 'linkedin', 'catho'],
  commercial:  ['google', 'catho', 'indeed'],
  general:     ['google', 'catho', 'indeed'],
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

  // Determina quais plataformas usar
  const platformPriority = CATEGORY_PLATFORMS[category] || CATEGORY_PLATFORMS.general;
  const activePlatforms = requestedPlatforms.length
    ? platformPriority.filter(p => requestedPlatforms.includes(p) || requestedPlatforms.includes('all'))
    : platformPriority;

  // Se "google" está ativo, cobre linkedin também
  const effectivePlatforms = activePlatforms.includes('google') && !activePlatforms.includes('linkedin')
    ? [...activePlatforms, 'linkedin']
    : activePlatforms;

  onProgress(5, `Detectado: ${category} — buscando em ${effectivePlatforms.length} plataformas...`);

  // Busca paralela em grupos de plataformas
  // LinkedIn via Google
  if (effectivePlatforms.some(p => ['google', 'linkedin'].includes(p))) {
    onProgress(15, 'Buscando perfis LinkedIn via Google...');
    try {
      const results = await searchGooglePeople(query, location, Math.ceil(limit * 0.5), ['linkedin']);
      allCandidates.push(...results);
      onProgress(35, `${results.length} perfis LinkedIn encontrados`);
    } catch (err) {
      console.error('[orchestrator] LinkedIn/Google error:', err.message);
      onProgress(35, 'LinkedIn: erro, continuando...');
    }
  }

  // Catho via Google
  if (effectivePlatforms.includes('catho')) {
    onProgress(45, 'Buscando perfis Catho...');
    try {
      const results = await searchGooglePeople(query, location, Math.ceil(limit * 0.3), ['catho']);
      allCandidates.push(...results);
      onProgress(65, `${results.length} perfis Catho encontrados`);
    } catch (err) {
      console.error('[orchestrator] Catho error:', err.message);
      onProgress(65, 'Catho: erro, continuando...');
    }
  }

  // Indeed via Google
  if (effectivePlatforms.includes('indeed')) {
    onProgress(70, 'Buscando perfis Indeed...');
    try {
      const results = await searchGooglePeople(query, location, Math.ceil(limit * 0.3), ['indeed']);
      allCandidates.push(...results);
      onProgress(85, `${results.length} perfis Indeed encontrados`);
    } catch (err) {
      console.error('[orchestrator] Indeed error:', err.message);
      onProgress(85, 'Indeed: erro, continuando...');
    }
  }

  onProgress(90, 'Deduplicando e pontuando candidatos...');
  const deduped = dedup(allCandidates);
  const ranked = scoreAndRank(deduped, query, location);

  onProgress(100, `${ranked.length} candidatos encontrados`);
  return ranked.slice(0, limit);
}
