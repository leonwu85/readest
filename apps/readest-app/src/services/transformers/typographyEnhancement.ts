import {
  decorateTypographyEnhancementDoc,
  hasEnabledTypographyEnhancement,
} from '@/utils/typographyEnhancement';
import type { Transformer } from './types';

export const typographyEnhancementTransformer: Transformer = {
  name: 'typographyEnhancement',

  transform: async (ctx) => {
    if (!hasEnabledTypographyEnhancement(ctx.viewSettings.typographyEnhancement)) {
      return ctx.content;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(ctx.content, 'text/html');
    const decorated = decorateTypographyEnhancementDoc(doc, ctx.viewSettings, {
      primaryLanguage: ctx.primaryLanguage,
      userLocale: ctx.userLocale,
    });
    if (!decorated) return ctx.content;
    return new XMLSerializer().serializeToString(doc);
  },
};
