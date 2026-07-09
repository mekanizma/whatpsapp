/**
 * Public company category list
 */

import { Response } from 'express';
import {
  COMPANY_CATEGORY_VALUES,
  getCompanyCategoryLabel,
} from '../constants/company-categories';

export async function getPublicCompanyCategories(req: { query: { lang?: string } }, res: Response): Promise<void> {
  const lang = String(req.query.lang || '').toLowerCase().startsWith('en') ? 'en' : 'tr';
  res.json({
    success: true,
    data: COMPANY_CATEGORY_VALUES.map((value) => ({
      value,
      label: getCompanyCategoryLabel(value, lang),
    })),
  });
}
