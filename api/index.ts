/**
 * Vercel serverless entry — Express API
 * Frontend ile aynı domain üzerinden /api/* rotalarına yönlendirilir
 */

import app from '../backend/dist/app';

export default app;
