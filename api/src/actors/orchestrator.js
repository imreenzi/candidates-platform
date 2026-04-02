/**
 * Orchestrator — busca candidatos ATIVOS em busca de emprego
 *
 * Plataformas: Catho, Vagas.com, Indeed resumes, currículos públicos
 * Foco em: pessoas cadastradas em plataformas de emprego com contato disponível
 */

import { searchGooglePeople } from './google-people.js';
import { scoreAndRank } from '../scoring/index.js';

function dedup(candidates) {
  const seen = new Set();
  return candidates.filter(c => {
    const key = c.url || `${c.name?.toLowerCase()}|${c.email || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function orchestrateSearch(query, location, requestedPlatforms, limit, onProgress) {
  const allCandidates = [];

  // Catho — principal plataforma de candidatos BR
  if (!requestedPlatforms.length || requestedPlatforms.includes('catho')) {
    onProgress(10, 'Buscando candidatos no Catho...');
    try {
      const results = await searchGooglePeople(query, location, Math.ceil(limit * 0.4), ['catho']);
      allCandidates.push(...results);
      onProgress(30, `${results.length} candidatos Catho encontrados`);
    } catch (err) {
      console.error('[orchestrator] Catho error:', err.message);
      onProgress(30, 'Catho: sem resultados, continuando...');
    }
  }

  // Vagas.com
  if (!requestedPlatforms.length || requestedPlatforms.includes('vagas')) {
    onProgress(35, 'Buscando candidatos no Vagas.com...');
    try {
      const results = await searchGooglePeople(query, location, Math.ceil(limit * 0.3), ['vagas']);
      allCandidates.push(...results);
      onProgress(55, `${results.length} candidatos Vagas.com encontrados`);
    } catch (err) {
      console.error('[orchestrator] Vagas error:', err.message);
      onProgress(55, 'Vagas.com: sem resultados, continuando...');
    }
  }

  // Indeed resumes
  if (!requestedPlatforms.length || requestedPlatforms.includes('indeed')) {
    onProgress(60, 'Buscando currículos no Indeed...');
    try {
      const results = await searchGooglePeople(query, location, Math.ceil(limit * 0.3), ['indeed']);
      allCandidates.push(...results);
      onProgress(75, `${results.length} currículos Indeed encontrados`);
    } catch (err) {
      console.error('[orchestrator] Indeed error:', err.message);
      onProgress(75, 'Indeed: sem resultados, continuando...');
    }
  }

  // Currículos públicos com contato
  if (!requestedPlatforms.length || requestedPlatforms.includes('curriculos')) {
    onProgress(78, 'Buscando currículos públicos com contato...');
    try {
      const results = await searchGooglePeople(query, location, Math.ceil(limit * 0.2), ['curriculos']);
      allCandidates.push(...results);
      onProgress(90, `${results.length} currículos públicos encontrados`);
    } catch (err) {
      console.error('[orchestrator] Curriculos error:', err.message);
      onProgress(90, 'Currículos: sem resultados, finalizando...');
    }
  }

  onProgress(95, 'Deduplicando e pontuando candidatos...');
  const deduped = dedup(allCandidates);
  const ranked = scoreAndRank(deduped, query, location);

  onProgress(100, `${ranked.length} candidatos encontrados`);
  return ranked.slice(0, limit);
}