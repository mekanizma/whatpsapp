import 'express-serve-static-core';
import 'http';

declare module 'express-serve-static-core' {
  interface Request {
    rawBody?: Buffer;
  }
}

declare module 'http' {
  interface IncomingMessage {
    rawBody?: Buffer;
  }
}

export {};
