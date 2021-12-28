export class DeferredPromise<T = void, E = any> {
  isPending = true
  isFulfilled = false
  isRejected = false
  reject: (x: E) => void = () => {}
  resolve: (x: T | PromiseLike<T>) => void = () => {}
  promise: Promise<T>

  constructor() {
    this.promise = new Promise<T>((res, rej) => {
      this.resolve = (...args) => {
        this.isPending = false
        this.isFulfilled = true
        res(...args)
      }
      this.reject = (...args) => {
        this.isPending = false
        this.isRejected = true
        rej(...args)
      }
    })
  }
}
