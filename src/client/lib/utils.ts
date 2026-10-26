import type {
  BrandSettings,
  BriefQuestion,
  FileAttachmentMeta,
  QuestionAnswerValue,
} from '../../shared/types';

export function applyBrandCssVars(brand?: BrandSettings | null): void {
  if (!brand || typeof document === 'undefined') return;
  const root = document.documentElement;
  if (brand.primaryColor)
    root.style.setProperty('--brand-primary', brand.primaryColor);
  if (brand.secondaryColor)
    root.style.setProperty('--brand-secondary', brand.secondaryColor);
  if (brand.navyColor) root.style.setProperty('--brand-navy', brand.navyColor);
  if (brand.darkColor) root.style.setProperty('--brand-dark', brand.darkColor);
  if (brand.surfaceColor)
    root.style.setProperty('--brand-surface', brand.surfaceColor);
}

export function isQuestionAnsweredClient(
  _q: BriefQuestion,
  ans: QuestionAnswerValue | undefined,
  attachments: FileAttachmentMeta[]
): boolean {
  if (attachments.length > 0) return true;
  if (!ans) return false;
  if (ans.text && ans.text.trim().length > 0) return true;
  if (ans.selectedOptionId) return true;
  if (ans.selectedOptionIds && ans.selectedOptionIds.length > 0) return true;
  if (ans.customOptions && ans.customOptions.some((c) => c.trim().length > 0))
    return true;
  if (typeof ans.spectrumValue === 'number') return true;
  if (ans.statementVotes && Object.keys(ans.statementVotes).length > 0)
    return true;
  if (ans.bucketAssignments && Object.keys(ans.bucketAssignments).length > 0)
    return true;
  if (ans.comment && ans.comment.trim().length > 0) return true;
  return false;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function formatDateTimeRu(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function buildPublicBriefUrl(
  accessToken: string,
  configuredPublicBaseUrl?: string
): string {
  const base =
    configuredPublicBaseUrl && configuredPublicBaseUrl.trim().length > 0
      ? configuredPublicBaseUrl.trim().replace(/\/+$/, '')
      : typeof window !== 'undefined'
        ? window.location.origin
        : '';
  return `${base}/b/${accessToken}`;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallback below
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  } catch {
    return false;
  }
}
