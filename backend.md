# AI Research Assistant Backend API Documentation

This document describes the RESTful API endpoints provided by the AI Research Assistant backend. The backend is built with Node.js, Express, and TypeScript, and provides functionality for managing collections, ingesting documents, and querying with AI-powered retrieval and generation.

## Base URL

All API endpoints are prefixed with `/api/v1` unless otherwise noted.

- Development: `http://localhost:3000/api/v1`
- Production: `https://your-domain.com/api/v1`

## Installation & Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Copy `.env.example` to `.env` and configure:
   - `POSTGRES_URL` - PostgreSQL connection string
   - `REDIS_URL` - Redis connection string
   - `OPENAI_API_KEY` - OpenAI API key (or OpenRouter key if configured)
   - `PORT` - Server port (default: 3000)
   - `NODE_ENV` - Environment (`development` or `production`)
   - `MAX_FILE_SIZE_MB` - Maximum upload file size in MB (default: 10)
   - `FRONTEND_URL` - CORS origin for production (optional)

4. Run database migrations:
   ```bash
   pnpm migrate
   ```
5. Start the development server:
   ```bash
   pnpm dev
   ```
   Or for production:
   ```bash
   pnpm start
   ```

## Authentication

Currently, the API does not implement authentication. All endpoints are publicly accessible. In a production environment, you should place the API behind an authentication layer or implement middleware as needed.

## Error Responses

All endpoints return JSON responses. Error responses follow this format:

```json
{
  "error": {
    "message": "Human-readable error message",
    "type": "ERROR_TYPE_CODE"
  }
}
```

Common error types:
- `VALIDATION_ERROR`: Invalid request body or parameters
- `INVALID_INPUT`: Missing or malformed required fields
- `FILE_TOO_LARGE`: Uploaded file exceeds size limit
- `INVALID_FILE_TYPE`: Unsupported file type
- `NO_FILE`: No file provided in upload request
- `NOT_FOUND`: Requested resource does not exist
- `INTERNAL_ERROR`: Unexpected server error

HTTP status codes:
- `200`: Success
- `201`: Resource created
- `400`: Bad request
- `404`: Not found
- `413`: Payload too large
- `500`: Internal server error

## Endpoints

### Collections

Manage document collections for organizing ingested files.

#### Get All Collections

Retrieve a list of all collections.

- **URL**: `GET /api/v1/collections`
- **Description**: Returns an array of collection objects sorted by creation date (newest first).
- **Request Parameters**: None
- **Success Response**:
  - **Code**: 200
  - **Content**:
    ```json
    {
      "data": [
        {
          "id": 1,
          "name": "Research Papers",
          "created_at": "2026-05-15T10:30:00.000Z"
        },
        {
          "id": 2,
          "name": "Project Notes",
          "created_at": "2026-05-10T14:22:00.000Z"
        }
      ]
    }
    ```
- **Error Responses**:
  - 500: Database connection error

#### Create Collection

Create a new collection.

- **URL**: `POST /api/v1/collections`
- **Description**: Creates a new collection with the provided name.
- **Request Body**:
  ```json
  {
    "name": "string (required, non-empty after trim)"
  }
  ```
- **Example**:
  ```json
  {
    "name": "Machine Learning"
  }
  ```
- **Success Response**:
  - **Code**: 201
  - **Content**:
    ```json
    {
      "data": {
        "id": 3,
        "name": "Machine Learning",
        "created_at": "2026-06-01T09:15:00.000Z"
      }
    }
    ```
- **Error Responses**:
  - 400: `name` is missing or empty after trimming (`INVALID_INPUT`)
  - 500: Database error

#### Delete Collection

Delete a collection by its ID.

- **URL**: `DELETE /api/v1/collections/:id`
- **Description**: Removes the collection and all associated documents and data.
- **URL Parameters**:
  - `id`: number (required) - The collection ID to delete
- **Success Response**:
  - **Code**: 200
  - **Content**:
    ```json
    {
      "message": "Collection deleted"
    }
    ```
- **Error Responses**:
  - 400: `id` is not a valid number (`INVALID_INPUT`)
  - 404: Collection with given ID does not exist (`NOT_FOUND`)
  - 500: Database error

### Ingest

Upload and process documents for ingestion into the system.

#### Upload Document

Upload a PDF or Markdown file to be processed and stored in a collection.

- **URL**: `POST /api/v1/ingest`
- **Description**: Accepts a file upload and associated metadata, processes the document (extracts text, creates embeddings, chunks), and stores it in the specified collection.
- **Request Format**: `multipart/form-data`
  - **file**: file (required) - The document to upload. Allowed types: `.pdf`, `.md`, `.markdown`. Maximum size defined by `MAX_FILE_SIZE_MB` environment variable (default 10MB).
  - **collection_name**: string (required) - Name of the collection to store the document in. If the collection does not exist, it will be created automatically.
- **Example (using curl)**:
  ```bash
  curl -X POST http://localhost:3000/api/v1/ingest \
    -F "file=@./research-paper.pdf" \
    -F "collection_name=Research Papers"
  ```
- **Success Response**:
  - **Code**: 201
  - **Content**:
    ```json
    {
      "data": {
        "id": 10,
        "collection_id": 2,
        "filename": "research-paper.pdf",
        "original_name": "research-paper.pdf",
        "size": 102400,
        "uploaded_at": "2026-06-01T09:20:00.000Z",
        "processing_status": "completed"
      }
    }
    ```
    Note: The exact fields in the `data` object may vary based on the ingest service implementation.
- **Error Responses**:
  - 400: 
    - No file provided (`NO_FILE`)
    - Invalid file type (`INVALID_FILE_TYPE`)
    - Missing or invalid `collection_name` in body (validated via Zod schema)
  - 413: File size exceeds limit (`FILE_TOO_LARGE`)
  - 500: Error during document processing (text extraction, embedding generation, etc.)

### Query

Process queries against ingested documents using retrieval-augmented generation (RAG).

#### Query with Streaming Response

Send a query and receive a streaming response via Server-Sent Events (SSE).

- **URL**: `POST /api/v1/query`
- **Description**: Accepts a query string, collection ID, and optional top_k parameter. Performs hybrid search (vector + keyword) to retrieve relevant document chunks, then streams an answer generated by an LLM (OpenRouter/OpenAI) token-by-token. Uses caching to avoid repeated LLM calls for identical queries.
- **Request Body**:
  ```json
  {
    "query": "string (required, non-empty)",
    "collection_id": "number (required)",
    "top_k": "number (optional, default: 5)"
  }
  ```
- **Example**:
  ```json
  {
    "query": "What are the main findings of the paper?",
    "collection_id": 2,
    "top_k": 5
  }
  ```
- **Success Response**:
  - **Content-Type**: `text/event-stream`
  - **Event Stream Format**:
    - Multiple `event: token` events - each contains a string token (word or part of word) of the generated answer
    - One `event: citation` event - contains citation payload with source references
    - One `event: meta` event - contains metadata about the query (token counts, model used, etc.)
    - Final `event: done` event - signals end of stream
  - **Example Event Stream**:
    ```
    event: token
    data: The

    event: token
    data: main

    event: token
    data: findings

    event: token
    data: are

    event: token
    data: that

    event: token
    data: the

    event: token
    data: approach

    event: token
    data: improves

    event: token
    data: accuracy

    event: token
    data: by

    event: token
    data: 15

    event: token
    data: percent

    event: citation
    data: {"sources":[{"document_id":5,"chunk_id":12,"score":0.92}]}

    event: meta
    data: {"model":"openrouter/openai/gpt-4o","tokens_used":45,"cache_hit":"query"}

    event: done
    data: {}
    ```
  - **Notes**:
    - The frontend should concatenate token data to display the streaming answer.
    - On cache hit, the answer is simulated by splitting the cached answer into tokens with a 20ms delay to maintain consistent UX.
    - The `cache_hit` field in meta will be either `"query"` (hit) or absent/miss.
- **Error Responses**:
  - 400: Validation error (missing query, invalid collection_id) - passed via next(err) and converted to JSON error by errorHandler middleware
  - 500: Internal error during query processing (LLM failure, etc.)
  - If connection is closed by client, stream ends gracefully.

#### Hybrid Search Test Endpoint (Temporary)

Perform hybrid search without LLM generation (for testing/debugging).

> **Warning**: This endpoint is temporary and may be removed in Phase 6. Do not rely on it for production use.

- **URL**: `POST /api/v1/query/retrieve`
- **Description**: Returns raw search results from the hybrid retriever (vector + keyword fusion) without generating an answer. Useful for debugging retrieval quality.
- **Request Body**:
  ```json
  {
    "query": "string (required, non-empty)",
    "collection_id": "number (required)",
    "top_k": "number (optional, default: 5)"
  }
  ```
- **Example**:
  ```json
  {
    "query": "attention mechanism",
    "collection_id": 1,
    "top_k": 3
  }
  ```
- **Success Response**:
  - **Code**: 200
  - **Content**:
    ```json
    {
      "data": [
        {
          "id": 12,
          "collection_id": 1,
          "content": "The attention mechanism allows the model to focus on relevant parts of the input...",
          "filename": "attention-paper.pdf",
          "score": 0.92,
          "rank": 1
        },
        {
          "id": 15,
          "collection_id": 1,
          "content": "Multi-head attention extends this concept by using multiple attention heads...",
          "filename": "attention-paper.pdf",
          "score": 0.87,
          "rank": 2
        }
      ],
      "count": 2
    }
    ```
    Note: The exact structure of each result object depends on the retriever implementation.
- **Error Responses**:
  - 400: Validation error
  - 500: Internal error during search

### Health Check

Check if the server is running.

- **URL**: `GET /health`
- **Description**: Simple health check endpoint.
- **Request Parameters**: None
- **Success Response**:
  - **Code**: 200
  - **Content**:
    ```json
    {
      "status": "ok",
      "timestamp": "2026-06-01T09:30:00.000Z"
    }
    ```

## CORS Configuration

The backend is configured to accept requests from:
- Development: `http://localhost:5173` (default Vite port)
- Production: Origin specified by `FRONTEND_URL` environment variable

Allowed headers: `Content-Type`

## Rate Limiting

- General rate limiting is applied via `express-rate-limit` with Redis store (configurable via environment variables, defaults to 100 requests per 15 minutes per IP).
- LLM query endpoint (`POST /api/v1/query`) has additional cost-based limiting to prevent excessive OpenAI/OpenRouter token usage.

## Security

- Uses `helmet.js` for HTTP header security
- File uploads are restricted to `.pdf`, `.md`, `.markdown` types
- Uploaded files are stored temporarily in the OS temp directory and cleaned up after processing
- Input validation is performed using Zod schemas

## Environment Variables Reference

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment (`development` or `production`) | `development` |
| `POSTGRES_URL` | PostgreSQL connection string | (required) |
| `REDIS_URL` | Redis connection string | (required) |
| `OPENAI_API_KEY` | OpenAI or OpenRouter API key | (required) |
| `MAX_FILE_SIZE_MB` | Maximum upload file size in MB | `10` |
| `FRONTEND_URL` | CORS origin for production | (optional) |
| `LLM_COST_LIMIT` | Maximum token cost per query interval (for llmLimiter) | `1000` |
| `LLM_COST_INTERVAL_MS` | Time window for LLM cost limit (ms) | `60000` (1 minute) |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window in ms | `900000` (15 minutes) |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | `100` |

## Implementation Notes

- The backend uses a modular structure with Express routers for each feature area.
- Services handle business logic and interact with database/external APIs.
- Utilities provide shared functionality (embedding, chunking, context building, etc.).
- TypeScript interfaces are defined in `src/types/`.
- Error handling is centralized via `errorHandler` middleware and custom `AppError` class.

## Future Enhancements (Planned)

- Phase 5: User authentication and authorization
- Phase 6: Query pipeline optimization (better caching, query rewriting)
- Phase 7: Multi-modal support (images, audio)
- Phase 8: Collaboration features (shared collections, commenting)
- Phase 9: Analytics and usage monitoring