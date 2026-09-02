// packages/print-core/src/functions/aggregate.ts
import { getByPath } from '../utils.js'

export function sum(rows: any[], field: string): number {
  return rows.reduce((acc, row) => acc + (Number(getByPath(row, field)) || 0), 0)
}

export function avg(rows: any[], field: string): number {
  if (rows.length === 0) return 0
  return sum(rows, field) / rows.length
}

export function count(rows: any[], field: string): number {
  return rows.length
}

export function min(rows: any[], field: string): number {
  if (rows.length === 0) return 0
  return Math.min(...rows.map(row => Number(getByPath(row, field)) || 0))
}

export function max(rows: any[], field: string): number {
  if (rows.length === 0) return 0
  return Math.max(...rows.map(row => Number(getByPath(row, field)) || 0))
}
