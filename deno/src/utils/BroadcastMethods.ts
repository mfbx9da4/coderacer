import { assert } from './assert.ts'
import { DeferredPromise } from './DeferredPromise.ts'

const uuid = () => crypto.randomUUID()

export type MethodNames<T> = { [K in keyof T]: T[K] extends Function ? K : never }[keyof T]
export type PickMethods<T> = Pick<T, MethodNames<T>>
type PromisifyMethods<T> = { [K in keyof T]: Promisify<T[K]> }
type Promisify<T> = T extends (...args: infer Args) => infer Ret
  ? Ret extends Promise<unknown>
    ? (...args: Args) => Ret
    : (...args: Args) => Promise<Ret>
  : never

type Payload<T> = { requestId: string; fn: keyof T; args: unknown[] }

export class BroadcastMethods<T extends Record<string, Function>> {
  timeout = 5000
  constructor(opts?: { timeout?: number }) {
    if (opts?.timeout) {
      this.timeout = opts.timeout
    }
  }

  expose(channelId: string, methods: T) {
    assert(channelId, 'missing channelId')
    const chan = new BroadcastChannel(channelId)
    chan.onmessage = async e => {
      assert(e.data, `missing data for "${channelId}"`)
      const data = e.data as Payload<T>
      const requestId = data.requestId
      const fn = data.fn
      const args = data.args
      if (!requestId) return
      if (typeof requestId !== 'string') if (!fn) return
      if (typeof fn !== 'string') return
      if (!Array.isArray(args)) return
      if (!methods[fn]) return
      try {
        const result = await methods[fn](...args)
        chan.postMessage({ result, requestId })
      } catch (error) {
        console.error('Can\'t post results, trying to send the error', error)
        try{
            chan.postMessage({ error, requestId })
        }catch(e){
            console.error('BroadcastChannel is dead failed to send error', e)
        }
      }
    }

    return chan
  }

  get(channelId: string): PromisifyMethods<T> {
    const exec = (fn: keyof PromisifyMethods<T>, args: unknown[]) => {
      assert(channelId, 'missing channelId')
      const requestId = uuid()
      const chan = new BroadcastChannel(channelId)
      const promise = new DeferredPromise<T[typeof fn]>()
      chan.onmessage = e => {
        if (!promise.isPending) return chan.close()
        if (requestId === e.data?.requestId) {
          chan.close()
          if ('error' in e.data) {
            promise.reject(e.data.error)
          } else {
            promise.resolve(e.data.result)
          }
        }
      }
      setTimeout(() => {
        if (promise.isPending) {
          chan.close()
          promise.reject(new Error(`Timeout for "${channelId}" method: "${fn}"`))
        }
      }, this.timeout)

      const payload: Payload<T> = { requestId, fn, args }
      chan.postMessage(payload)
      return promise.promise
    }

    return new Proxy(
      {},
      {
        get: (_, fn) => {
          return (...args: unknown[]) => exec(fn as keyof PromisifyMethods<T>, args)
        },
      },
    ) as PromisifyMethods<T>
  }
}

export async function usage() {
  // Set up some in memory state.
  // We want to make this state globally available to all deno instances.
  let count = 0
  const counterMethods = {
    increment: () => (count += 1),
    decrement: () => (count -= 1),
    currentCount: () => count,
  }
  // This ID should be unique across all deno instances.
  const counterId = 'some-uuid'

  const globalCounters = new BroadcastMethods<typeof counterMethods>()

  // We expose the counter methods to all deno instances for this specific `counterId`
  globalCounters.expose(counterId, counterMethods)

  // We can now get the current state of the counter from it's origin deno instance.
  // If the counter is on this deno instance, it will short circuit and return the current state.
  // If the counter has not yet been initialized or the origin deno instance has died, this will
  // throw with a timeout error.
  const counterInstance = globalCounters.get(counterId)
  console.log('currentCount', await counterInstance.currentCount())

  // We can also increment and decrement the counter on it's origin deno instance.
  await counterInstance.increment()
  await counterInstance.increment()
  await counterInstance.decrement()
  console.log('currentCount2', await counterInstance.currentCount())
}
