/**
 * Bilgi bankası dosya yükleme — memory storage
 */

import multer from 'multer';
import {
  isAllowedKnowledgeFile,
  isAllowedKnowledgeMimeType,
  KNOWLEDGE_FILE_FORMATS_MESSAGE,
} from '../services/document-parser.service';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export const knowledgeFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (isAllowedKnowledgeFile(file.originalname) || isAllowedKnowledgeMimeType(file.mimetype, file.originalname)) {
      cb(null, true);
      return;
    }
    cb(new Error(KNOWLEDGE_FILE_FORMATS_MESSAGE));
  },
});

const MESSAGE_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MESSAGE_IMAGE_MAX_SIZE = 5 * 1024 * 1024;

export const messageImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MESSAGE_IMAGE_MAX_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (MESSAGE_IMAGE_MIMES.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error('Yalnızca JPEG, PNG, WebP veya GIF resimleri desteklenir'));
  },
});

const COMPANY_LOGO_MAX_SIZE = 5 * 1024 * 1024;

export const companyLogoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: COMPANY_LOGO_MAX_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (MESSAGE_IMAGE_MIMES.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error('Yalnızca JPEG, PNG, WebP veya GIF logoları desteklenir'));
  },
});

const REFERENCE_LOGO_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);
const REFERENCE_LOGO_MAX_SIZE = 5 * 1024 * 1024;

export const referenceLogoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: REFERENCE_LOGO_MAX_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (REFERENCE_LOGO_MIMES.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error('Yalnızca JPEG, PNG, WebP, GIF veya SVG logoları desteklenir'));
  },
});
