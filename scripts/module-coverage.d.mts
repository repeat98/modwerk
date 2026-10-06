export type CoverageSelection = { ids: string[]; keepStockFx2: boolean }
export function comparisonPool(availableIds: readonly string[]): string[]
export function coverageSelections(id: string, pool: readonly string[], options?: { sample?: number }): CoverageSelection[]
export function selectionKey(ids: readonly string[], keepStockFx2: boolean): string
export const COMPARED_BEFORE_RECORDS: Readonly<Record<string, string>>
export const NOT_COMPOSED: readonly string[]
