/**
 * Facebook Groups — candidatos em grupos de vagas BR
 *
 * Actor: apify/facebook-groups-scraper
 * Custo: ~$5/1K posts
 * Requer: FACEBOOK_COOKIE env var (session cookie do Facebook)
 *
 * Sem cookie → retorna [] graciosamente.
 */

import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_TOKEN });

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,4}/;
const PHONE_RE = /(?:\+?55[\s-]?)?(?:\(?\d{2}\)?[\s-]?)(?:9[\s-]?)?\d{4}[\s-]?\d{4}/;

// Grupos brasileiros de emprego com maior tráfego
const JOB_GROUPS = [
  'https://www.facebook.com/groups/vagasdeemprego.brasil',
  'https://www.facebook.com/groups/procuroempregobr',
  'https://www.facebook.com/groups/curriculos.vagas.empregos',
  'https://www.facebook.com/groups/vagasempregosp',
];

const SEEKER_KEYWORDS = [
  'procurando emprego', 'procuro emprego', 'em busca de', 'buscando oportunidade',
  'disponível para', 'disponivel para', 'desempregado', 'quero trabalhar',
  'me chama', 'meu currículo', 'meu curriculo', 'estou disponível', 'estou disponivel',
];

function isJobSeeker(text) {
  const lower = (text || '').toLowerCase();
  return SEEKER_KEYWORDS.some(k => lower.includes(k));
}

function extractEmail(text) {
  const m = (text || '').match(EMAIL_RE);
  return m ? m[0].toLowerCase() : null;
}

function extractPhone(text) {
  const m = (text || '').match(PHONE_RE);
  if (!m) return null;
  const digits = m[0].replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 13) return null;
  return m[0].trim();
}

function guessTitle(text, fallback) {
  const m = (text || '').match(
    /(?:sou|trabalho como|experiência como|atuo como|cargo de|função de)\s+([^,.!\n]{3,40})/i
  );
  return m
    ? m[1].trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
    : fallback;
}

export async function searchFacebookGroups(query, location, limit = 20) {
  const cookie = process.env.FACEBOOK_COOKIE;
  if (!cookie) {
    console.warn('[facebook-groups] FACEBOOK_COOKIE não configurado — ignorando');
    return [];
  }

  const city = location.split(',')[0].trim().toLowerCase();

  try {
    const run = await client.actor('apify/facebook-groups-scraper').call({
      startUrls: JOB_GROUPS.map(url => ({ url })),
      maxPosts: limit * 6,
      maxPostComments: 0,
      maxReviews: 0,
      useStealth: true,
      cookies: [{ name: 'c_user', value: cookie }],
    }, { waitSecs: 180 });

    const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit: limit * 6 });

    const candidates = [];

    for (const post of items) {
      const text = post.text || post.message || '';
      if (!text || !isJobSeeker(text)) continue;
      if (city && !text.toLowerCase().includes(city)) continue;

      const email = extractEmail(text);
      const phone = extractPhone(text);
      if (!email && !phone) continue;

      const name = post.authorName || post.postAuthor?.name || '';
      if (!name || name.length < 3) continue;

      candidates.push({
        name,
        title: guessTitle(text, query),
        company: '',
        location: city ? `${city.charAt(0).toUpperCase() + city.slice(1)}, Brasil` : 'Brasil',
        email,
        phone,
        url: post.postUrl || post.url || '',
        platform: 'facebook',
        source: 'facebook-groups',
      });

      if (candidates.length >= limit) break;
    }

    return candidates;
  } catch (err) {
    console.error('[facebook-groups] Actor error:', err.message);
    return [];
  }
}
