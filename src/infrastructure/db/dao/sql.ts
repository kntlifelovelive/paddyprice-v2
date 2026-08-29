/**
 * Tiny sql.js binding helpers shared by the DAO modules.
 * Binding + row mapping only — no business logic.
 */
import type { Database, SqlValue } from 'sql.js'
import { scheduleSave } from '../persistence'

export type SqlParams = readonly SqlValue[]
export type Row = Record<string, SqlValue>

/** Run a write statement. */
export function run(db: Database, sql: string, params?: SqlParams): void {
  db.run(sql, params as SqlValue[] | undefined)
  scheduleSave()
}

/** Run an INSERT and return the new rowid. */
export function insert(db: Database, sql: string, params?: SqlParams): number {
  db.run(sql, params as SqlValue[] | undefined)
  scheduleSave()
  return Number(queryScalar(db, 'SELECT last_insert_rowid()'))
}

/** SELECT rows mapped to objects keyed by column name. */
export function queryAll(db: Database, sql: string, params?: SqlParams): Row[] {
  const result = db.exec(sql, params as SqlValue[] | undefined)
  if (result.length === 0) return []
  const { columns, values } = result[0]
  return values.map((row) => {
    const record: Row = {}
    columns.forEach((column, i) => {
      record[column] = row[i]
    })
    return record
  })
}

export function queryOne(db: Database, sql: string, params?: SqlParams): Row | null {
  return queryAll(db, sql, params)[0] ?? null
}

/** First column of the first row, or null when the query has no result. */
export function queryScalar(db: Database, sql: string, params?: SqlParams): SqlValue | null {
  const result = db.exec(sql, params as SqlValue[] | undefined)
  const value = result[0]?.values[0]?.[0]
  return value === undefined ? null : value
}
