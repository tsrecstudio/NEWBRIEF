import zlib from 'node:zlib';

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [clampByte(r), clampByte(g), clampByte(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

function cmykToHex(c: number, m: number, y: number, k: number): string {
  const r = 255 * (1 - c) * (1 - k);
  const g = 255 * (1 - m) * (1 - k);
  const b = 255 * (1 - y) * (1 - k);
  return rgbToHex(r, g, b);
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h: h * 360, s, l };
}

function colorDistance(hexA: string, hexB: string): number {
  const a = hexA.replace('#', '');
  const b = hexB.replace('#', '');
  const dr = parseInt(a.slice(0, 2), 16) - parseInt(b.slice(0, 2), 16);
  const dg = parseInt(a.slice(2, 4), 16) - parseInt(b.slice(2, 4), 16);
  const db = parseInt(a.slice(4, 6), 16) - parseInt(b.slice(4, 6), 16);
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Extracts dominant vector brand colors from a PDF buffer by scanning both raw
 * content streams and FlateDecode-compressed PDF streams for PDF graphics operators
 * (`rg`, `RG`, `k`, `K`, and `#RRGGBB` annotations/SVG/metadata).
 */
export function extractBrandColorsFromPdf(pdfBuffer: Buffer): {
  palette: string[];
  suggestedPrimary: string;
  suggestedSecondary: string;
  suggestedNavy: string;
  suggestedDark: string;
} {
  const counts = new Map<string, number>();
  const bump = (hex: string, weight = 1) => {
    if (!/^#[0-9A-F]{6}$/i.test(hex)) return;
    const upper = hex.toUpperCase();
    // Ignore pure white and near-pure white backgrounds
    const { l } = hexToHsl(upper);
    if (l > 0.97) return;
    counts.set(upper, (counts.get(upper) || 0) + weight);
  };

  const textChunks: string[] = [pdfBuffer.toString('latin1')];

  // Decompress FlateDecode PDF streams where vector graphics operators live
  const rawLatin = textChunks[0];
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  let decompressedCount = 0;
  while (
    (match = streamRegex.exec(rawLatin)) !== null &&
    decompressedCount < 120
  ) {
    const chunkBuf = Buffer.from(match[1], 'latin1');
    try {
      const inflated = zlib.inflateSync(chunkBuf);
      textChunks.push(inflated.toString('latin1'));
      decompressedCount++;
    } catch {
      try {
        const inflatedRaw = zlib.inflateRawSync(chunkBuf);
        textChunks.push(inflatedRaw.toString('latin1'));
        decompressedCount++;
      } catch {
        // Not a zlib stream (e.g. JPEG DCTDecode), skip safely
      }
    }
  }

  const rgbOpRegex =
    /(?:^|\s)(0(?:\.\d+)?|1(?:\.0+)?)\s+(0(?:\.\d+)?|1(?:\.0+)?)\s+(0(?:\.\d+)?|1(?:\.0+)?)\s+(?:rg|RG|sc|SC|scn|SCN)(?=\s|$)/gm;
  const cmykOpRegex =
    /(?:^|\s)(0(?:\.\d+)?|1(?:\.0+)?)\s+(0(?:\.\d+)?|1(?:\.0+)?)\s+(0(?:\.\d+)?|1(?:\.0+)?)\s+(0(?:\.\d+)?|1(?:\.0+)?)\s+(?:k|K)(?=\s|$)/gm;
  const hexMentionRegex = /#([0-9a-fA-F]{6})\b/g;

  for (const chunk of textChunks) {
    let m: RegExpExecArray | null;
    while ((m = rgbOpRegex.exec(chunk)) !== null) {
      const r = parseFloat(m[1]) * 255;
      const g = parseFloat(m[2]) * 255;
      const b = parseFloat(m[3]) * 255;
      bump(rgbToHex(r, g, b), 2);
    }
    while ((m = cmykOpRegex.exec(chunk)) !== null) {
      const c = parseFloat(m[1]);
      const mag = parseFloat(m[2]);
      const y = parseFloat(m[3]);
      const k = parseFloat(m[4]);
      bump(cmykToHex(c, mag, y, k), 2);
    }
    while ((m = hexMentionRegex.exec(chunk)) !== null) {
      bump(`#${m[1].toUpperCase()}`, 3);
    }
  }

  // Deduplicate perceptually close colors
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const distinct: string[] = [];
  for (const [hex] of sorted) {
    if (distinct.every((existing) => colorDistance(existing, hex) > 28)) {
      distinct.push(hex);
    }
    if (distinct.length >= 10) break;
  }

  const vibrant = distinct.filter((hex) => {
    const { s, l } = hexToHsl(hex);
    return s >= 0.35 && l >= 0.25 && l <= 0.72;
  });

  const deepAccents = distinct.filter((hex) => {
    const { s, l } = hexToHsl(hex);
    return s >= 0.25 && l >= 0.1 && l < 0.32;
  });

  const nearBlacks = distinct.filter((hex) => {
    const { l } = hexToHsl(hex);
    return l < 0.16;
  });

  const suggestedPrimary = vibrant[0] || '#306DFA';
  const suggestedSecondary = vibrant[1] || deepAccents[0] || '#486ACC';
  const suggestedNavy = deepAccents[0] || '#082A5E';
  const suggestedDark = nearBlacks[0] || '#101013';

  const palette =
    distinct.length > 0
      ? distinct
      : ['#306DFA', '#486ACC', '#082A5E', '#101013', '#F8F8F9'];

  return {
    palette,
    suggestedPrimary,
    suggestedSecondary,
    suggestedNavy,
    suggestedDark,
  };
}
