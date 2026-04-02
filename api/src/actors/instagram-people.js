/**
 * Instagram — candidatos via hashtags de busca de emprego
 *
 * Pipeline:
 *   1. apify/instagram-hashtag-scraper → posts recentes de #procurandoemprego
 *   2. apify/instagram-profile-scraper → extrai bio/WhatsApp dos perfis
 *
 * Custo: ~$2.30/1K (hashtag) + $2.60/1K (profiles)
 * Não requer login — perfis públicos.
 */

import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_TOKEN });

const PHONE_RE = /(?:\+?55[\s-]?)?(?:\(?\d{2}\)?[\s-]?)(?:9[\s-]?)?\d{4}[\s-]?\d{4}/;
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,4}/;

// Hashtags brasileiras de busca de emprego
const JOB_HASHTAGS = [
  'procurandoemprego',
  'procuroemprego',
  'buscandoemprego',
  'disponivelnomercado',
];

function extractPhone(text) {
  const m = (text || '').match(PHONE_RE);
  if (!m) return null;
  const digits = m[0].replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 13) return null;
  return m[0].trim();
}

function extractEmail(text) {
  const m = (text || '').match(EMAIL_RE);
  return m ? m[0].toLowerCase() : null;
}

function isRelevantPost(post, query, city) {
  const text = (post.caption || post.text || '').toLowerCase();
  const queryWord = (query || '').toLowerCase().split(' ')[0];
  const hasQuery = queryWord.length > 2 && text.includes(queryWord);
  const hasCity = !city || text.includes(city.toLowerCase());
  return hasQuery || hasCity;
}

export async function searchInstagramPeople(query, location, limit = 15) {
  const city = location.split(',')[0].trim();

  try {
    // Step 1: posts de hashtags de busca de emprego
    const run1 = await client.actor('apify/instagram-hashtag-scraper').call({
      hashtags: JOB_HASHTAGS,
      resultsLimit: limit * 5,
      addParentData: false,
    }, { waitSecs: 120 });

    const { items: posts } = await client.dataset(run1.defaultDatasetId).listItems({ limit: limit * 5 });

    // Filtra posts relevantes ao cargo/cidade
    const relevant = posts.filter(p => isRelevantPost(p, query, city));
    if (!relevant.length) return [];

    // Coleta usernames únicos
    const usernames = [...new Set(
      relevant.map(p => p.ownerUsername || p.username).filter(Boolean)
    )].slice(0, limit * 2);

    if (!usernames.length) return [];

    // Step 2: perfis para extrair bio/contato
    const run2 = await client.actor('apify/instagram-profile-scraper').call({
      usernames,
      resultsLimit: usernames.length,
    }, { waitSecs: 120 });

    const { items: profiles } = await client.dataset(run2.defaultDatasetId).listItems({ limit: usernames.length });

    const candidates = [];

    for (const profile of profiles) {
      const bio = profile.biography || profile.bio || '';
      const phone =
        extractPhone(bio) ||
        extractPhone(profile.publicPhoneNumber || '') ||
        null;
      const email =
        extractEmail(bio) ||
        extractEmail(profile.publicEmail || '') ||
        null;

      if (!phone && !email) continue;

      const name = profile.fullName || profile.username || '';
      if (!name || name.length < 2) continue;

      candidates.push({
        name,
        title: query,
        company: '',
        location: city || 'Brasil',
        email,
        phone,
        url: `https://www.instagram.com/${profile.username}/`,
        platform: 'instagram',
        source: 'instagram-hashtag',
      });

      if (candidates.length >= limit) break;
    }

    return candidates;
  } catch (err) {
    console.error('[instagram] Actor error:', err.message);
    return [];
  }
}
