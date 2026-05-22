# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Installation:**
```bash
pnpm install
```

**Development Server:**
```bash
pnpm dev
# Runs tsx --watch ./src/server.ts with automatic restart on file changes
```

**Production Build:**
```bash
pnpm start
# Runs node dist/server.js after TypeScript compilation
```

**Database Migrations:**
```bash
pnpm migrate
# Runs tsx src/config/migrate.ts to apply SQL migrations
```

**Environment Setup:**
Copy `.env.example` to `.env` and configure:
- Database connection (POSTGRES_URL)
- Redis connection (REDIS_URL)
- OpenAI API key (OPENAI_API_KEY)
- Port configuration (PORT, default 3000)
- Node environment (NODE_ENV, development/production)

## Project Architecture

**High-Level Structure:**
- `src/app.ts` - Express application setup with middleware (helmet, cors, body parsing)
- `src/server.ts` - Application entry point with database/redis connection checks
- `src/config/` - Configuration files for environment, database, Redis, and OpenAI
- `src/middleware/` - Custom middleware (error handling, rate limiting, LLM limiting)
- `src/modules/` - Feature modules organized by domain:
  - `collections/` - Manage document collections
  - `ingest/` - Document upload and processing pipeline (Phase 2 planned)
  - `query/` - Query processing with retrieval and LLM streaming (Phase 6 planned)
- `src/types/` - Shared TypeScript interfaces and types
- `src/utils/` - Utility functions

**Data Flow:**
1. HTTP requests enter through Express routes in module controllers
2. Controllers delegate to service layers for business logic
3. Services interact with database (PostgreSQL via pg) and external APIs (OpenAI)
4. Redis used for caching and rate limiting
5. Document processing pipeline planned for file ingestion (multer + pdf-parse)

**Key Technologies:**
- Runtime: Node.js with TypeScript (tsx for development)
- Framework: Express.js
- Database: PostgreSQL with node-postgres (pg)
- Caching/Queue: Redis
- AI Integration: OpenAI API (tiktoken for token counting)
- Validation: Zod for request schema validation
- File Handling: Multer for multipart/form-data
- Markdown Processing: Marked library
- Rate Limiting: express-rate-limit with Redis store
- Security: Helmet.js, CORS configuration

**Current Implementation Status:**
- Phase 1: Basic server setup with health check endpoint ✓
- Phase 2: Ingestion pipeline implemented ✓
- Phase 3-5: Not yet implemented
- Phase 6: Query pipeline (planned - currently returns 501)
- Phases 7+: Future enhancements

**Database Schema:**
See `backend/migrations/001_init.sql` for initial tables including:
- collections table for storing collection metadata
- documents table for ingested files
- Future tables planned for embeddings, chunks, etc.

**Environment Variables:**
Required variables (see `.env.example`):
- `POSTGRES_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string  
- `OPENAI_API_KEY` - OpenAI API key for LLM embeddings/completions
- `FRONTEND_URL` - CORS origin for production
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)