/**
 * Indeed — via Google Search (custo zero extra, sem actor próprio)
 *
 * O actor hMvNSpz3JnHgl5jkh não suporta a URL de resumes do BR.
 * Solução: buscar perfis Indeed via Google Search (já coberto por google-people.js).
 * Este módulo existe como fallback/alias para compatibilidade com o orchestrator.
 */

import { searchGooglePeople } from './google-people.js';

export async function searchIndeedResumes(query, location, limit = 20) {
  // Delega ao Google Search com target Indeed
  return searchGooglePeople(query, location, limit, ['indeed']);
}
