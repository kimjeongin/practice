import { createHash } from 'crypto'
import { readFileSync } from 'fs'

export function calculateFileHash(filePath: string): string {
  try {
    const content = readFileSync(filePath)
    return createHash('sha256').update(content).digest('hex')
  } catch (error) {
    throw new Error(`Failed to calculate hash for ${filePath}: ${error}`)
  }
}

