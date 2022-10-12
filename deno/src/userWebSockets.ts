import { BroadcastMethods } from './utils/BroadcastMethods.ts'
import { Race, User, UserId } from './types.ts'

type WebSocketResponse = {
  type: 'error' | 'pong' | 'member.joined' | 'member.updated' | 'race.created'
  requestId: string
}

const localUserSockets: Map<UserId, { userId: UserId; socket: WebSocket }> = new Map()

const globalUserSockets = new BroadcastMethods<{
  send: <T extends WebSocketResponse>(data: T) => void
}>()

export function addWebSocket(socket: WebSocket, user?: User) {
  const userId = user?.userId
  if (!userId) return
  const currentSocket = localUserSockets.get(userId)?.socket
  if (currentSocket !== socket) {
    const send = <T extends WebSocketResponse>(data: T) => {
      try {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify(data))
        }
      } catch (error) {
        console.error('Failed to send to socket', data, error)
        destroy()
      }
    }

    const channel = globalUserSockets.expose(userId, { send })

    const destroy = () => {
      channel.close()
      localUserSockets.delete(userId)
    }

    socket.onclose = destroy

    localUserSockets.set(userId, { userId, socket })
  }
}

export function sendToRaceMembers<T extends WebSocketResponse>(race: Race, data: T) {
  for (const member of race.members.values()) {
    sendToUser(member.userId, data)
  }
}

export function sendToUser<T extends WebSocketResponse>(userId: UserId, data: T) {
  console.log('userId, data', userId, data)
  return globalUserSockets.get(userId).send(data)
}
