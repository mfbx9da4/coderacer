// Some html just for debugging the requests and responses of web sockets
export function html() {
  return /* html */ `
<script>
  const userId =  sessionStorage.getItem('userId') || 'user_' +crypto.randomUUID()
  const protocol = new URL(location.href).protocol === 'http:' ? 'ws://' : 'wss://';
  const log = (str) => {
    console.log(str)
    pre.textContent += str +"\\n"
  }
  let ws = new WebSocket(protocol+location.host)
  ws.onmessage = e => log(JSON.stringify(JSON.parse(e.data), null, 2))
  const ping = () => {
    ws.send(JSON.stringify({ type: 'ping', t: Date.now() }))
    log(JSON.stringify({ type: 'ping', t: Date.now() }))
    setTimeout(ping, 10000)
  }
  setTimeout(() => {
    ping()
    ws.send(JSON.stringify({ type: 'joinOrCreateRace', user: { userId }, requestId: crypto.randomUUID() }))
  }, 1000)
</script>`
}
