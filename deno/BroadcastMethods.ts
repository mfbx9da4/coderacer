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
    chan.onmessage = async (e) => {
      assert(e.data, `missing data for "${channelId}"`)
      const data = e.data as Payload<T>
      const requestId = data.requestId
      const fn = data.fn
      const args = data.args
      assert(requestId && typeof requestId === 'string', `missing requestId for "${channelId}"`)
      assert(typeof fn === 'string', `missing fn for "${channelId}"`)
      assert(Array.isArray(args), `missing args for "${channelId}"`)
      assert(methods[fn], `missing method "${fn}" for "${channelId}"`)
      try {
        const result = await methods[fn](...args)
        chan.postMessage({ result, requestId })
      } catch (error) {
        chan.postMessage({ error, requestId })
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
      chan.onmessage = (e) => {
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
          promise.reject(new Error(`timeout for "${channelId}" method: "${fn}"`))
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
