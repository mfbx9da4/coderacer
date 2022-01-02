export function tryJsonParse(data: string) {
  try {
    return JSON.parse(data)
  } catch {
    return
  }
}
