export enum ErrorCode {
  RaceNotFound = 'RaceNotFound',
  RaceMemberNotFound = 'RaceMemberNotFound',
  RaceAlreadyExists = 'RaceAlreadyExists',
  RaceMemberAlreadyExists = 'RaceMemberAlreadyExists',
  AssertionError = 'AssertionError',
}

export type AssertionExtra = (Record<string, unknown> & { name?: ErrorCode }) | ErrorCode

export function assert(predicate: any, message: string, extra: AssertionExtra = {}): asserts predicate {
  if (!predicate) {
    extra = typeof extra === 'string' ? { name: extra } : extra
    if (!('name' in extra)) {
      extra.name = ErrorCode.AssertionError
    }
    throw new AssertionError(message, extra)
  }
}

export class AssertionError extends Error {
  constructor(message: string, extra: any = {}) {
    super(message)
    this.name = 'AssertionError'
    Object.assign(this, extra)
  }
}
