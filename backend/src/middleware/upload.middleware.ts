/**
 * Bilgi bankası dosya yükleme — memory storage
 */

import multer from 'multer';
import { isAllowedKnowledgeFile } from '../services/document-parser.service';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export const knowledgeFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedKnowledgeFile(file.originalname)) {
      cb(new Error('Desteklenen formatlar: PDF, Word (.docx), Excel (.xlsx, .xls)'));
      return;
    }
    cb(null, true);
  },
});
