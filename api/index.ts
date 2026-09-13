/**
 * Vercel serverless entry point.
 *
 * @vercel/node accepts an Express application as the default export and drives
 * it per invocation, so the same app object serves `pnpm dev` locally and the
 * deployed function in production. Routing lives entirely in the Express app;
 * vercel.json only forwards every /api/* path here.
 */
export { default } from "../backend/src/app";
