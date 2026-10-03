// ---------------------------------------------------------------------------
// 10. cta-action — slide ajakan bertindak khusus per kategori
// ---------------------------------------------------------------------------

import {
  components,
  type TemplateContext,
  type TemplateDefinition,
} from './base.ts';

const { kicker, esc, emphasize } = components;

function formatDateShort(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  try {
    return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  } catch {
    return value;
  }
}

const ctaAction: TemplateDefinition = {
  slug: 'cta-action',
  name: 'CTA Action',
  description: 'Slide ajakan bertindak yang menyesuaikan tampilan per jenis CTA (promo, komunitas, simpan, ikuti, konsultasi).',
  supportedRoles: ['cta'],
  limits: { headlineChars: 52, bodyChars: 180, bullets: 0, bulletChars: 0 },
  render: (slide, ctx) => {
    const cta = ctx.callToAction;
    if (!cta) return '';
    const isPromo = cta.kind === 'promo';
    const isCommunity = cta.kind === 'community';
    const valid = isPromo && cta.validUntil
      ? `<div class="cta-valid">Berlaku sampai ${esc(formatDateShort(cta.validUntil))}</div>`
      : '';
    const promoCode = isPromo && cta.promoCode
      ? `<div class="cta-code">${esc(cta.promoCode)}</div>`
      : '';
    const communityName = isCommunity && cta.communityName
      ? `<div class="cta-community-name">${esc(cta.communityName)}</div>`
      : '';
    const detail = cta.detail ? `<div class="cta-detail">${esc(cta.detail)}</div>` : '';
    return `
    ${kicker(ctx, 'Ajak Bertindak')}
    <h1 class="headline" style="font-size: clamp(58px, 6.2vw, 78px); margin-top: 24px;">
      ${emphasize(slide.headline, slide.emphasis)}
    </h1>
    <div class="cta cta-${esc(cta.kind)}" style="margin-top: 36px;">
      ${promoCode}
      ${communityName}
      ${detail}
      ${valid}
    </div>
    <div class="spacer"></div>
    `;
  },
};

export { ctaAction };