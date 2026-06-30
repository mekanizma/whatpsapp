/**
 * Global error handling middleware
 */

import { Request, Response, NextFunction } from 'express';
import multer from 'multer';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
    return;
  }

  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Dosya boyutu en fazla 10 MB olabilir'
        : 'Dosya yüklenemedi';
    res.status(400).json({ success: false, error: message });
    return;
  }

  if (err.message?.includes('Desteklenen formatlar')) {
    res.status(400).json({ success: false, error: err.message });
    return;
  }

  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Sunucu hatası oluştu',
  });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: 'Endpoint bulunamadı',
  });
}
