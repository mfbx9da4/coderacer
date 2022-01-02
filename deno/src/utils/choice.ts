export const choice = <T>(array: Array<T> | Readonly<Array<T>>): T | undefined =>
  array[Math.round(Math.random() * (array.length - 1))]
