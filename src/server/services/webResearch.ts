import dns from 'node:dns/promises';
import net from 'node:net';
import type { WebResearchSource } from '../../shared/types.js';

/**
 * Checks whether an IPv4 or IPv6 address belongs to loopback, link-local,
 * private RFC1918, or metadata ranges to prevent SSRF attacks.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  const clean = ip.replace(/^::ffff:/i, '');
  if (net.isIPv4(clean)) {
    const parts = clean.split('.').map(Number);
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('fe80')) return true;
    return false;
  }
  return true;
}

export async function validateSafePublicUrl(
  rawUrl: string,
  skipDnsLookup = false
): Promise<URL | null> {
  try {
    const trimmed = rawUrl.trim();
    if (!trimmed) return null;
    // If any scheme is explicitly specified, it MUST be http:// or https://
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
      return null;
    }
    const withProto = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const parsed = new URL(withProto);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      (!net.isIP(host) && !host.includes('.'))
    ) {
      return null;
    }
    if (net.isIP(host)) {
      if (isPrivateOrReservedIp(host)) return null;
      return parsed;
    }
    if (!skipDnsLookup) {
      const records = await dns.lookup(host, { all: true });
      if (
        records.length === 0 ||
        records.some((r) => isPrivateOrReservedIp(r.address))
      ) {
        return null;
      }
    }
    return parsed;
  } catch {
    return null;
  }
}

export function stripHtmlToCleanText(html: string, maxChars = 4500): {
  title: string;
  description: string;
  text: string;
  internalLinks: string[];
} {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaDescMatch =
    html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["']/i
    ) ||
    html.match(
      /<meta[^>]+content=["']([\s\S]*?)["'][^>]+name=["']description["']/i
    );

  const decodeEntities = (s: string) =>
    s
      .replace(/&nbsp;/gi, ' ')
      .replace(/&quot;/gi, '"')
      .replace(/&laquo;|&#171;/gi, '«')
      .replace(/&raquo;|&#187;/gi, '»')
      .replace(/&mdash;|&#8212;/gi, '—')
      .replace(/&ndash;|&#8211;/gi, '–')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));

  const links: string[] = [];
  const hrefRegex = /<a[^>]+href=["']([^"'#]+)["']/gi;
  let hm: RegExpExecArray | null;
  while ((hm = hrefRegex.exec(html)) !== null && links.length < 40) {
    links.push(hm[1]);
  }

  const bodyOnly = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<(h[1-4]|li|p|br|tr|div|section)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  const text = decodeEntities(bodyOnly)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 2)
    .join('\n')
    .slice(0, maxChars);

  return {
    title: decodeEntities(titleMatch?.[1] || '').replace(/\s+/g, ' ').trim(),
    description: decodeEntities(metaDescMatch?.[1] || '')
      .replace(/\s+/g, ' ')
      .trim(),
    text,
    internalLinks: links,
  };
}

export class WebResearchService {
  constructor(
    private options: {
      tavilyApiKey?: string;
      fetchImpl?: typeof fetch;
      skipDnsCheckForTests?: boolean;
    } = {}
  ) {}

  private get fetchFn(): typeof fetch {
    return this.options.fetchImpl || fetch;
  }

  async crawlWebsite(
    rawSiteUrl: string,
    maxPages = 4
  ): Promise<{
    sources: WebResearchSource[];
    extractedCorpus: string;
  }> {
    const safeRoot = await validateSafePublicUrl(
      rawSiteUrl,
      this.options.skipDnsCheckForTests
    );
    if (!safeRoot) {
      return { sources: [], extractedCorpus: '' };
    }

    const sources: WebResearchSource[] = [];
    const corpusParts: string[] = [];
    const visited = new Set<string>();

    const fetchSinglePage = async (urlObj: URL) => {
      const normalized = urlObj.origin + urlObj.pathname.replace(/\/+$/, '');
      if (visited.has(normalized)) return null;
      visited.add(normalized);

      try {
        const res = await this.fetchFn(urlObj.toString(), {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (compatible; MSDISBriefResearchBot/1.0; +https://mcdis.ru)',
            Accept: 'text/html,application/xhtml+xml',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(6500),
        });
        if (!res.ok) return null;
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('html') && !ct.includes('text')) return null;
        const html = await res.text();
        return stripHtmlToCleanText(html, 3500);
      } catch {
        return null;
      }
    };

    const homeParsed = await fetchSinglePage(safeRoot);
    if (!homeParsed) {
      return { sources: [], extractedCorpus: '' };
    }

    sources.push({
      title: homeParsed.title || safeRoot.hostname,
      url: safeRoot.toString(),
      snippet:
        homeParsed.description || homeParsed.text.slice(0, 260) || safeRoot.hostname,
      sourceType: 'website',
    });
    corpusParts.push(
      `[Сайт клиента: ${safeRoot.toString()}]\nЗаголовок: ${homeParsed.title}\nОписание: ${homeParsed.description}\nКонтент:\n${homeParsed.text}`
    );

    // Pick high-value internal pages (about, products, services, production, solutions)
    const priorityRegex =
      /(about|company|o-kompanii|product|service|uslug|solution|proizvod|project|tech|industry)/i;
    const candidateUrls: URL[] = [];
    for (const href of homeParsed.internalLinks) {
      try {
        const resolved = new URL(href, safeRoot);
        if (
          resolved.hostname === safeRoot.hostname &&
          priorityRegex.test(resolved.pathname)
        ) {
          candidateUrls.push(resolved);
        }
      } catch {
        // ignore invalid href
      }
    }

    const subPages = candidateUrls.slice(0, Math.max(0, maxPages - 1));
    const subResults = await Promise.all(
      subPages.map(async (u) => ({ url: u, parsed: await fetchSinglePage(u) }))
    );

    for (const item of subResults) {
      if (!item.parsed || !item.parsed.text) continue;
      sources.push({
        title: item.parsed.title || item.url.pathname,
        url: item.url.toString(),
        snippet: item.parsed.description || item.parsed.text.slice(0, 240),
        sourceType: 'website',
      });
      corpusParts.push(
        `[Внутренняя страница: ${item.url.toString()}]\n${item.parsed.text.slice(0, 2200)}`
      );
    }

    return {
      sources,
      extractedCorpus: corpusParts.join('\n\n'),
    };
  }

  async searchDuckDuckGo(query: string): Promise<WebResearchSource[]> {
    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=ru-ru`;
      const res = await this.fetchFn(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
          Accept: 'text/html',
          'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
        },
        signal: AbortSignal.timeout(6500),
      });
      if (!res.ok) return [];
      const html = await res.text();

      const results: WebResearchSource[] = [];
      const blockRegex =
        /<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/a>|<div[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/div>)/gi;

      let match: RegExpExecArray | null;
      while ((match = blockRegex.exec(html)) !== null && results.length < 6) {
        let targetUrl = match[1];
        const uddgMatch = targetUrl.match(/[?&]uddg=([^&]+)/);
        if (uddgMatch) {
          targetUrl = decodeURIComponent(uddgMatch[1]);
        }
        const title = match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        const snippet = (match[3] || match[4] || '')
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' ')
          .trim();

        if (title && /^https?:\/\//i.test(targetUrl)) {
          results.push({
            title,
            url: targetUrl,
            snippet,
            sourceType: 'search',
          });
        }
      }
      return results;
    } catch {
      return [];
    }
  }

  async searchWikipedia(query: string): Promise<WebResearchSource[]> {
    try {
      const apiUrl = `https://ru.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        query
      )}&utf8=1&format=json&srlimit=3`;
      const res = await this.fetchFn(apiUrl, {
        headers: {
          'User-Agent': 'MSDISBriefResearchBot/1.0 (https://mcdis.ru)',
        },
        signal: AbortSignal.timeout(5500),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as {
        query?: {
          search?: Array<{ title: string; snippet: string; pageid: number }>;
        };
      };
      const items = data.query?.search || [];
      return items.map((item) => ({
        title: `${item.title} — Википедия`,
        url: `https://ru.wikipedia.org/wiki/${encodeURIComponent(
          item.title.replace(/ /g, '_')
        )}`,
        snippet: item.snippet.replace(/<[^>]+>/g, '').trim(),
        sourceType: 'wikipedia' as const,
      }));
    } catch {
      return [];
    }
  }

  async searchTavily(query: string): Promise<WebResearchSource[]> {
    if (!this.options.tavilyApiKey) return [];
    try {
      const res = await this.fetchFn('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: this.options.tavilyApiKey,
          query,
          search_depth: 'advanced',
          max_results: 5,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as {
        results?: Array<{ title: string; url: string; content: string }>;
      };
      return (data.results || []).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content?.slice(0, 350) || '',
        sourceType: 'tavily' as const,
      }));
    } catch {
      return [];
    }
  }

  async runMultiSourceResearch(params: {
    companyName: string;
    companyWebsite?: string;
    industry?: string;
    queries: string[];
  }): Promise<{
    sources: WebResearchSource[];
    corpus: string;
    executedQueries: string[];
  }> {
    const executedQueries = params.queries.slice(0, 5);
    const allSources: WebResearchSource[] = [];
    const corpusBlocks: string[] = [];

    // 1. Crawl direct client website if provided
    if (params.companyWebsite?.trim()) {
      const siteResult = await this.crawlWebsite(params.companyWebsite.trim(), 4);
      allSources.push(...siteResult.sources);
      if (siteResult.extractedCorpus) {
        corpusBlocks.push(siteResult.extractedCorpus);
      }
    }

    // 2. Run web search queries in parallel across Tavily (if key set) + DuckDuckGo + Wikipedia
    const queryResults = await Promise.all(
      executedQueries.map(async (q) => {
        const [tavilyHits, ddgHits, wikiHits] = await Promise.all([
          this.searchTavily(q),
          this.searchDuckDuckGo(q),
          this.searchWikipedia(q),
        ]);
        return { query: q, hits: [...tavilyHits, ...ddgHits, ...wikiHits] };
      })
    );

    const seenUrls = new Set(allSources.map((s) => s.url));
    for (const qr of queryResults) {
      for (const hit of qr.hits) {
        if (!seenUrls.has(hit.url)) {
          seenUrls.add(hit.url);
          allSources.push(hit);
          corpusBlocks.push(
            `[Найдено по запросу "${qr.query}"] ${hit.title} (${hit.url}): ${hit.snippet}`
          );
        }
      }
    }

    // 3. If client website wasn't explicitly specified, try crawling the top company search hit!
    if (!params.companyWebsite?.trim() && allSources.length > 0) {
      const firstExternal = allSources.find(
        (s) =>
          s.sourceType === 'search' &&
          !/wikipedia\.org|rusprofile\.ru|checko\.ru|hh\.ru|saby\.ru/i.test(
            s.url
          )
      );
      if (firstExternal) {
        const crawled = await this.crawlWebsite(firstExternal.url, 2);
        if (crawled.extractedCorpus) {
          corpusBlocks.push(crawled.extractedCorpus);
        }
      }
    }

    return {
      sources: allSources.slice(0, 15),
      corpus: corpusBlocks.join('\n\n').slice(0, 14000),
      executedQueries,
    };
  }
}
