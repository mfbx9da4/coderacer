import { browser } from '$app/env'
import { writable } from 'svelte/store'
import { v4 as uuid } from '@lukeed/uuid'

export type User = { userId: string; name?: string }

// if (!browser) {
//   localStorage = {
//     getItem: (_key: string) => undefined,
//     setItem: (_key: string, _value: string) => undefined,
//     removeItem: (_key: string) => undefined,
//   }
// }

function noop() {}

function createUserStore() {
  if (!browser) {
    return {
      subscribe: (fn) => {
        fn({})
        return noop
      },
      setName: noop,
      logout: noop,
    }
  }
  let user: User
  if (localStorage.getItem('user')) {
    user = JSON.parse(localStorage.getItem('user') || '{}')
  } else {
    user = { userId: `user_${uuid()}` }
  }
  localStorage.setItem('user', JSON.stringify(user))

  const { subscribe, set, update } = writable<User>(user)

  self.addEventListener('storage', () => {
    console.log('storage')
    const newUser = JSON.parse(localStorage.getItem('user') || '{}')
    if (newUser.name !== user.name || newUser.userId !== user.userId) {
      update(newUser)
    }
  })

  return {
    subscribe,
    setName: (name: string) => {
      update((u) => {
        u.name = name
        localStorage.setItem('user', JSON.stringify(u))
        return u
      })
    },
    logout: () => {
      localStorage.removeItem('user')
      set({ userId: `user_${uuid()}` })
    },
  }
}

export const user = createUserStore()
