import type { ModuleDocument } from '../src/catalog/module-contract.ts'
type BaselineEntry = { id: string; version: string; folderSha256: string }
export const BASELINE_PATH: string
export function moduleFolderSha256(folder: string): Promise<string>
export function qualificationReports(document: ModuleDocument): string[]
export function moduleNativeSourceSha256(folder: string, document: ModuleDocument): Promise<string>
export function parseQualificationBaseline(value: unknown): Map<string, BaselineEntry>
export function requireFolderQualification(folder: string, document: ModuleDocument, baseline: Map<string, BaselineEntry>, waivers?: Map<string, unknown>, options?: { root?: string; approvedRef?: string }): Promise<'retained-evidence' | 'retained' | 'qualified' | 'owner-approved-standalone' | 'owner-waived'>
