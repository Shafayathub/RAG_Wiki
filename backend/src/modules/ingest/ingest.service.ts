import path from "path";
import fs from "fs";
import { pool } from "../../config/db";
import { chunkFile } from "../../utils/chunker";
import { embedChunks } from "../../utils/embedder";
import { IngestResponse, EmbeddedChunk } from "../../types";
import { AppError } from "../../types";


/**
 * Upsert a collection by name — create if it doesn't exist,
 * return id either way. ON CONFLICT handles duplicate names
 * without throwing an error.
 */
async function upsertCollection(name: string): Promise<number> {
    const result = await pool.query<{ id: number }>(
        `INSERT INTO collections (name)
     VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
        [name.trim()],
    );
    return result.rows[0]!.id;
}

/**
 * Insert a document row and return its id.
 */
async function insertDocument(
    collectionId: number,
    filename: string,
    fileType: "pdf" | "markdown",
): Promise<number> {
    const result = await pool.query<{ id: number }>(
        `INSERT INTO documents (collection_id, filename, file_type)
     VALUES ($1, $2, $3)
     RETURNING id`,
        [collectionId, filename, fileType],
    );
    return result.rows[0]!.id;
}

/**
 * Bulk-insert all embedded chunks in a single transaction.
 *
 * Why a single transaction?
 * If the insert fails halfway through, the whole batch rolls
 * back — no partial document states in the DB.
 *
 * Why unnest() instead of individual INSERTs?
 * One round-trip to Postgres vs N round-trips. For a 200-chunk
 * document this is the difference between ~2s and ~0.1s.
 */
async function bulkInsertChunks(
    documentId: number,
    embeddedChunks: EmbeddedChunk[],
): Promise<void> {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // Build parallel arrays — unnest() zips them row by row
        const chunkIndexes: number[] = [];
        const pageNumbers: (number | null)[] = [];
        const contents: string[] = [];
        const embeddings: string[] = [];  // pgvector expects '[x,y,z]' string
        const tokenCounts: number[] = [];

        for (const chunk of embeddedChunks) {
            chunkIndexes.push(chunk.chunk_index);
            pageNumbers.push(chunk.page_number);
            contents.push(chunk.content);
            embeddings.push(`[${chunk.embedding.join(",")}]`);
            tokenCounts.push(chunk.token_count);
        }

        await client.query(
            `INSERT INTO chunks
         (document_id, chunk_index, page_number, content, embedding, token_count)
       SELECT $1, u.ci, u.pn, u.co, u.em::vector, u.tc
       FROM unnest(
         $2::int[],
         $3::int[],
         $4::text[],
         $5::text[],
         $6::int[]
       ) AS u(ci, pn, co, em, tc)`,
            [
                documentId,
                chunkIndexes,
                pageNumbers,
                contents,
                embeddings,
                tokenCounts,
            ],
        );

        // Update total_chunks on the document row
        await client.query(
            `UPDATE documents SET total_chunks = $1 WHERE id = $2`,
            [embeddedChunks.length, documentId],
        );

        await client.query("COMMIT");
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Full ingestion pipeline — called by the controller.
 * Returns a summary the API sends back to the client.
 */
export async function ingestDocument(
    filePath: string,
    originalName: string,
    collectionName: string,
): Promise<IngestResponse> {
    const ext = path.extname(originalName).toLowerCase();
    const fileType = ext === ".pdf" ? "pdf" : "markdown";

    if (![".pdf", ".md", ".markdown"].includes(ext)) {
        throw new AppError(
            400,
            `Unsupported file type: ${ext}. Only PDF and Markdown are accepted.`,
            "UNSUPPORTED_FILE_TYPE",
        );
    }

    try {
        // 1. Ensure collection exists
        const collectionId = await upsertCollection(collectionName);

        // 2. Create document record
        const documentId = await insertDocument(collectionId, originalName, fileType);

        // 3. Chunk the file
        const rawChunks = await chunkFile(filePath, fileType);

        if (rawChunks.length === 0) {
            throw new AppError(422, "Document produced no chunks — it may be empty.", "EMPTY_DOCUMENT");
        }

        // 4. Embed all chunks (with caching)
        const embeddedChunks = await embedChunks(rawChunks);

        // 5. Bulk insert into DB
        await bulkInsertChunks(documentId, embeddedChunks);

        return {
            document_id: documentId,
            collection_id: collectionId,
            filename: originalName,
            total_chunks: embeddedChunks.length,
            message: "Document ingested successfully",
        };
    } finally {
        // Always clean up the temp file regardless of success or failure
        fs.unlink(filePath, () => { });
    }
}