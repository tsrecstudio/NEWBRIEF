import { describe, it, expect } from 'vitest';
import zlib from 'node:zlib';
import { extractBrandColorsFromPdf } from '../src/server/services/pdfColors.js';

describe('Corporate PDF Brandbook Color Extractor', () => {
  it('extracts vector RGB and compressed FlateDecode stream colors accurately', () => {
    // Stream with МСДИС Electric Blue (0.188 0.427 0.980 rg -> #306DFA) and Deep Navy (0.031 0.165 0.369 rg -> #082A5E)
    const contentOps = `
      q
      0.1882 0.4275 0.9804 rg
      0 0 200 100 re f
      0.1882 0.4275 0.9804 RG
      0.0314 0.1647 0.3686 rg
      10 10 50 50 re f
      0.0627 0.0627 0.0745 rg
      Q
    `;
    const compressed = zlib.deflateSync(Buffer.from(contentOps, 'latin1'));

    const header = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Filter /FlateDecode >>\nstream\n', 'latin1');
    const footer = Buffer.from('\nendstream\nendobj\n%%EOF', 'latin1');
    const fakePdfBuffer = Buffer.concat([header, compressed, footer]);

    const result = extractBrandColorsFromPdf(fakePdfBuffer);
    expect(result.palette).toContain('#306DFA');
    expect(result.suggestedPrimary).toBe('#306DFA');
    expect(result.suggestedNavy).toBe('#082A5E');
    expect(result.suggestedDark).toBe('#101013');
  });
});
