import { access, readFile, writeFile } from "node:fs/promises"
import { constants as fsConstants } from "node:fs"

export const pathExists = async (path: string): Promise<boolean> => {
  try {
    await access(path, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

export const readUtf8 = async (path: string): Promise<string> => readFile(path, "utf8")

export const writeUtf8 = async (path: string, data: string): Promise<void> => {
  await writeFile(path, data, "utf8")
}
