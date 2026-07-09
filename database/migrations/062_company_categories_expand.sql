-- Migration 062: Genişletilmiş şirket sektör kategorileri

ALTER TYPE company_category ADD VALUE IF NOT EXISTS 'teknoloji';
ALTER TYPE company_category ADD VALUE IF NOT EXISTS 'e_ticaret';
ALTER TYPE company_category ADD VALUE IF NOT EXISTS 'perakende';
ALTER TYPE company_category ADD VALUE IF NOT EXISTS 'lojistik';
ALTER TYPE company_category ADD VALUE IF NOT EXISTS 'insaat';
ALTER TYPE company_category ADD VALUE IF NOT EXISTS 'hukuk';
ALTER TYPE company_category ADD VALUE IF NOT EXISTS 'muhasebe';
ALTER TYPE company_category ADD VALUE IF NOT EXISTS 'sigorta';
ALTER TYPE company_category ADD VALUE IF NOT EXISTS 'veteriner';
ALTER TYPE company_category ADD VALUE IF NOT EXISTS 'eczane';
ALTER TYPE company_category ADD VALUE IF NOT EXISTS 'spor_salonu';
ALTER TYPE company_category ADD VALUE IF NOT EXISTS 'kuafor';
ALTER TYPE company_category ADD VALUE IF NOT EXISTS 'otomotiv';
ALTER TYPE company_category ADD VALUE IF NOT EXISTS 'temizlik';
ALTER TYPE company_category ADD VALUE IF NOT EXISTS 'turizm';
ALTER TYPE company_category ADD VALUE IF NOT EXISTS 'danismanlik';
