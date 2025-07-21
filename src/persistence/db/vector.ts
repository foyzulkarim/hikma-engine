import { SQLiteClient } from './connection';
import { DatabaseOperationError } from '../../utils/error-handling';
import { getErrorMessage } from '../../utils/error-handling';

export async function storeVector(
  client: SQLiteClient,
  table: string,
  column: string,
  recordId: string,
  embedding: number[],
): Promise<void> {
  const db = client.getDb();
  const embeddingBlob = Buffer.from(new Float32Array(embedding).buffer);
  const sql = `UPDATE ${table} SET ${column} = ? WHERE id = ?`;

  try {
    db.prepare(sql).run(embeddingBlob, recordId);
  } catch (error) {
    throw new DatabaseOperationError(
      'SQLite',
      'storeVector',
      getErrorMessage(error),
      error,
    );
  }
}

export async function vectorSearch(
  client: SQLiteClient,
  table: string,
  column: string,
  queryEmbedding: number[],
  limit: number = 10,
  threshold?: number,
): Promise<Array<{ id: string; similarity: number; data: any }>> {
  const db = client.getDb();
  const queryBlob = Buffer.from(new Float32Array(queryEmbedding).buffer);
  let sql = `
    SELECT id,
           vec_distance_cosine(${column}, ?) as similarity,
           *
    FROM ${table}
    WHERE ${column} IS NOT NULL
  `;
  const params: any[] = [queryBlob];

  if (threshold !== undefined) {
    const distanceThreshold = 1 - threshold;
    sql += ` AND vec_distance_cosine(${column}, ?) <= ?`;
    params.push(queryBlob, distanceThreshold);
  }

  sql += ` ORDER BY similarity ASC LIMIT ?`;
  params.push(limit);

  try {
    const results = db.prepare(sql).all(...params);
    return results.map((row: any) => ({
      id: row.id,
      similarity: 1 - row.similarity,
      data: row,
    }));
  } catch (error) {
    throw new DatabaseOperationError(
      'SQLite',
      'vectorSearch',
      getErrorMessage(error),
      error,
    );
  }
}

export async function semanticSearch(
  client: SQLiteClient,
  queryEmbedding: number[],
  limit: number = 5,
): Promise<{
  files: any[];
  functions: any[];
  commits: any[];
  pullRequests: any[];
}> {
  const [files, functions, commits, pullRequests] = await Promise.all([
    vectorSearch(client, 'files', 'content_embedding', queryEmbedding, limit),
    vectorSearch(
      client,
      'functions',
      'signature_embedding',
      queryEmbedding,
      limit,
    ),
    vectorSearch(client, 'commits', 'message_embedding', queryEmbedding, limit),
    vectorSearch(
      client,
      'pull_requests',
      'title_embedding',
      queryEmbedding,
      limit,
    ),
  ]);

  return { files, functions, commits, pullRequests };
}

export async function batchStoreEmbeddings(
  client: SQLiteClient,
  table: string,
  column: string,
  records: Array<{ id: string; embedding: number[] }>,
): Promise<{ success: number; failed: number; errors: string[] }> {
  const db = client.getDb();
  const stmt = db.prepare(`UPDATE ${table} SET ${column} = ? WHERE id = ?`);
  let success = 0;
  let failed = 0;
  const errors: string[] = [];
  const updateMany = db.transaction(
    (recordList: Array<{ id: string; embedding: number[] }>) => {
      for (const record of recordList) {
        try {
          const embeddingBlob = Buffer.from(
            new Float32Array(record.embedding).buffer,
          );
          stmt.run(embeddingBlob, record.id);
          success++;
        } catch (error) {
          failed++;
          const errorMsg = `Failed to store embedding for ${
            record.id
          }: ${getErrorMessage(error)}`;
          errors.push(errorMsg);
        }
      }
    },
  );

  try {
    updateMany(records);
  } catch (error) {
    throw new DatabaseOperationError(
      'SQLite',
      'batchStoreEmbeddings',
      getErrorMessage(error),
      error,
    );
  }

  return { success, failed, errors };
}
