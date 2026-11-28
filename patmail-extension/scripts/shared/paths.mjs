import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SCRIPTS_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
export const EXTENSION_ROOT = dirname(SCRIPTS_ROOT)
export const REPO_ROOT = dirname(EXTENSION_ROOT)
export const SRC_ROOT = join(EXTENSION_ROOT, 'src')
export const DIST_ROOT = join(EXTENSION_ROOT, 'dist')
export const CI_ROOT = join(EXTENSION_ROOT, 'ci')
export const TEST_RESULTS_ROOT = join(EXTENSION_ROOT, 'test-results')
export const TESTS_ROOT = join(EXTENSION_ROOT, 'tests')
export const REPO_PUBLIC_ROOT = join(REPO_ROOT, 'public')
export const EXTENSION_PUBLIC_ROOT = join(EXTENSION_ROOT, 'public')
