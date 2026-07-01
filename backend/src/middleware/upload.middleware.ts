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
