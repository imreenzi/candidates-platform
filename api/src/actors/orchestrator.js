/**
 * Orchestrator — coordena actors por tipo de vaga e plataformas selecionadas
 *
 * Estratégia de custo:
 *   1. Google People Search (SEMPRE — mais barato)
 *   2. Catho/Vagas HTTP direto (SEMPRE — custo zero)
 *   3. Indeed Actor (vagas industriais/operacionais)
 *   4. LinkedIn Direct (profissional/tech — mais caro, opcional)
 *
 * Detecção automática de categoria por palavras-chave no cargo
 */

import { searchGooglePeople } from './google-people.js';
import { searchIndeedResumes } from './indeed.js';
import { searchCatho, searchVagas } from './catho.js';
import { scoreAndRank } from '../scoring/index.js';

// Categorias de vagas por palavras-chave
const JOB_CATEGORIES = {
  blue_collar: [
    'ajudante', 'auxiliar', 'operador', 'servente', 'pedreiro', 'eletricista',
    'mecânico', 'motorista', 'entregador', 'estoquista', 'almoxarife',
    'zelador', 'porteiro', 'vigia', 'segurança', 'faxineiro', 'limpeza',
    'cozinheiro', 'copeiro', 'garçom', 'motoboy', 'office boy',
  ],
  tech: [
    'desenvolvedor', 'developer', 'engenheiro de software', 'programador',
    'analista de sistemas', 'devops', 'data science', 'machine learning',
    'frontend', 'backend', 'fullstack', 'mobile', 'qa engineer',
  ],
  professional: [
    'gerente', 'analista', 'coordenador', 'supervisor', 'diretor',
    'consultor', 'especialista', 'contador', 'advogado', 'médico',
    'enfermeiro', 'professor', 'arquiteto', 'engenheiro',
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
 * Deduplicação por nome+empresa (normalizado)
 */
function dedup(candidates) {
  const seen = new Set();
  return candidates.filter(c => {
    const key = `${c.name?.toLowerCase().trim()}|${c.url || c.company?.toLowerCase().trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Executa busca orquestrada
 * @param {string} query - cargo desejado
 * @param {string} location - cidade, estado
 * @param {string[]} platforms - ['google', 'linkedin', 'indeed', 'catho', 'vagas']
 * @param {number} limit - máximo de candidatos por plataforma
 * @param {Function} onProgress - callback(percent, message)
 */
export async function orchestrateSearch(query, location, platforms, limit, onProgress) {
  const category = detectCategory(query);
  const allCandidates = [];

  // Prioridade de platforms por categoria
  const prioritized = prioritizePlatforms(platforms, category);

  let step = 0;
  const totalSteps = prioritized.length;

  for (const platform of prioritized) {
    step++;
    const pct = Math.round((step / totalSteps) * 85);
    onProgress(pct, `Buscando em ${platformLabel(platform)}...`);

    try {
      let results = [];
      const perPlatformLimit = Math.ceil(limit / totalSteps) + 5;

      switch (platform) {
        case 'google':
          results = await searchGooglePeople(query, location, perPlatformLimit);
          break;
        case 'indeed':
          results = await searchIndeedResumes(query, location, perPlatformLimit);
          break;
        case 'catho':
          results = await searchCatho(query, location, perPlatformLimit);
          break;
        case 'vagas':
          results = await searchVagas(query, location, perPlatformLimit);
          break;
        case 'linkedin':
          // LinkedIn direct é caro — usar Google first, enrich depois se necessário
          results = await searchGooglePeople(query + ' site:linkedin.com/in', location, perPlatformLimit);
          break;
      }

      allCandidates.push(...results);
      onProgress(pct, `${results.length} candidatos encontrados em ${platformLabel(platform)}`);
    } catch (err) {
      console.error(`[orchestrator] Error on ${platform}:`, err.message);
      onProgress(pct, `Erro em ${platformLabel(platform)}, continuando...`);
    }
  }

  onProgress(90, 'Deduplicando e pontuando candidatos...');

  const deduped = dedup(allCandidates);
  const ranked = scoreAndRank(deduped, query, location);

  onProgress(100, `${ranked.length} candidatos encontrados e rankeados`);

  return ranked.slice(0, limit);
}

function prioritizePlatforms(requested, category) {
  const defaults = {
    blue_collar: ['google', 'indeed', 'catho', 'vagas'],
    tech: ['google', 'linkedin', 'indeed'],
    professional: ['google', 'linkedin', 'indeed'],
    commercial: ['google', 'indeed', 'catho'],
    general: ['google', 'indeed', 'catho'],
  };

  const priority = defaults[category] || defaults.general;

  // Filter to only requested platforms, keeping priority order
  if (requested.includes('all') || !requested.length) return priority;
  return priority.filter(p => requested.includes(p));
}

function platformLabel(platform) {
  const labels = {
    google: 'Google/LinkedIn',
    linkedin: 'LinkedIn',
    indeed: 'Indeed',
    catho: 'Catho',
    vagas: 'Vagas.com',
  };
  return labels[platform] || platform;
}
