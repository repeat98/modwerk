export function packageRecipe(plan: Record<string, unknown>): Record<string, unknown>
export function exportText(recipe: unknown): string
export function reproducesExport(committed: string, plan: Record<string, unknown>): boolean
