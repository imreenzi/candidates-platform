/**
 * Orchestrator — busca candidatos ATIVOS em busca de emprego
 *
 * Fontes:
 *   • Catho, Vagas.com, Indeed, Currículos públicos (via Google Search)
 *   • Facebook Groups (requer FACEBOOK_COOKIE)
 *   • Instagram hashtags #procurandoemprego
 */

import { searchGooglePeople } from './google-people.js';
import { searchFacebookGroups } from './facebook-groups.js';
import { searchInstagramPeople } from './instagram-people.js';
import { scoreAndRank } from '../scoring/index.js';

function dedup(candidates) {
  const seen = new Set();
  return candidates.filter(c => {
    const key = c.url || `${c.name?.toLowerCase()}|${c.email || ''}|${c.phone || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function orchestrateSearch(query, location, requestedPlatforms, limit, onProgress) {
  const allCandidates = [];
  const all = !requestedPlatforms.length;

  // ── Catho ────────────────────────────────────────────────────────────────
  if (all || requestedPlatforms.includes('catho')) {
    onProgress(8, 'Buscando candidatos no Catho...');
    try {
      const results = await searchGooglePeople(query, location, Math.ceil(limit * 0.35), ['catho']);
      allCandidates.push(...results);
      onProgress(22, `${results.length} candidatos Catho encontrados`);
    } catch (err) {
      console.error('[orchestrator] Catho error:', err.message);
      onProgress(22, 'Catho: sem resultados, continuando...');
    }
  }

  // ── Vagas.com ─────────────────────────────────────────────────────────────
  if (all || requestedPlatforms.includes('vagas')) {
    onProgress(25, 'Buscando candidatos no Vagas.com...');
    try {
      const results = await searchGooglePeople(query, location, Math.ceil(limit * 0.25), ['vagas']);
      allCandidates.push(...results);
      onProgress(38, `${results.length} candidatos Vagas.com encontrados`);
    } catch (err) {
      console.error('[orchestrator] Vagas error:', err.message);
      onProgress(38, 'Vagas.com: sem resultados, continuando...');
    }
  }

  // ── Indeed ────────────────────────────────────────────────────────────────
  if (all || requestedPlatforms.includes('indeed')) {
    onProgress(40, 'Buscando currículos no Indeed...');
    try {
      const results = await searchGooglePeople(query, location, Math.ceil(limit * 0.25), ['indeed']);
      allCandidates.push(...results);
      onProgress(52, `${results.length} currículos Indeed encontrados`);
    } catch (err) {
      console.error('[orchestrator] Indeed error:', err.message);
      onProgress(52, 'Indeed: sem resultados, continuando...');
    }
  }

  // ── Currículos públicos ───────────────────────────────────────────────────
  if (all || requestedPlatforms.includes('curriculos')) {
    onProgress(54, 'Buscando currículos públicos com contato...');
    try {
      const results = await searchGooglePeople(query, location, Math.ceil(limit * 0.2), ['curriculos']);
      allCandidates.push(...results);
      onProgress(64, `${results.length} currículos públicos encontrados`);
    } catch (err) {
      console.error('[orchestrator] Curriculos error:', err.message);
      onProgress(64, 'Currículos: sem resultados, continuando...');
    }
  }

  // ── Facebook Groups ───────────────────────────────────────────────────────
  if (requestedPlatforms.includes('facebook')) {
    onProgress(66, 'Buscando candidatos em grupos do Facebook...');
    try {
      const results = await searchFacebookGroups(query, location, Math.ceil(limit * 0.3));
      allCandidates.push(...results);
      onProgress(78, `${results.length} candidatos Facebook encontrados`);
    } catch (err) {
      console.error('[orchestrator] Facebook error:', err.message);
      onProgress(78, 'Facebook: sem resultados, continuando...');
    }
  }

  // ── Instagram ─────────────────────────────────────────────────────────────
  if (requestedPlatforms.includes('instagram')) {
    onProgress(80, 'Buscando candidatos no Instagram...');
    try {
      const results = await searchInstagramPeople(query, location, Math.ceil(limit * 0.2));
      allCandidates.push(...results);
      onProgress(90, `${results.length} candidatos Instagram encontrados`);
    } catch (err) {
      console.error('[orchestrator] Instagram error:', err.message);
      onProgress(90, 'Instagram: sem resultados, finalizando...');
    }
  }

  onProgress(93, 'Deduplicando e pontuando candidatos...');
  const deduped = dedup(allCandidates);
  const ranked = scoreAndRank(deduped, query, location);

  onProgress(100, `${ranked.length} candidatos encontrados`);
  return ranked.slice(0, limit);
}
