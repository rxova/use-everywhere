import { leaderEffectCaptures } from '../rules/leader-effect-captures.js';
import { ruleTester } from './rule-tester.js';

ruleTester.run('leader-effect-captures', leaderEffectCaptures, {
  valid: [
    // Module scope and imports outlive every render.
    {
      code: `import { connect } from './socket';\nconst URL = 'wss://x';\nfunction Chat() { useLeaderEffect(() => connect(URL)); return null; }`,
    },
    // A ref is the documented escape hatch: stable box, current value.
    {
      code: `function Chat({ roomId }) {\n  const roomRef = useRef(roomId);\n  useLeaderEffect(() => connect(roomRef.current));\n  return null;\n}`,
    },
    // Registry getters hand back the one instance for a name.
    {
      code: `function Chat() {\n  const chat = useChannel('chat');\n  useLeaderEffect(() => chat.post('ping', 1));\n  return null;\n}`,
    },
    {
      code: `function Chat() {\n  const store = getSharedStore('cart');\n  useLeaderEffect(() => store.set('open', true));\n  return null;\n}`,
    },
    // Setters are stable by React's contract, and by ours.
    {
      code: `function Chat() {\n  const [, setOpen] = useState(false);\n  useLeaderEffect(() => setOpen(true));\n  return null;\n}`,
    },
    {
      code: `function Chat() {\n  const [, setTheme] = useSharedState('theme', 'dark');\n  useLeaderEffect(() => setTheme('light'));\n  return null;\n}`,
    },
    // Declared inside the callback: nothing to capture.
    {
      code: `function Chat() { useLeaderEffect(() => { const socket = open(); return () => socket.close(); }); return null; }`,
    },
    // A leader effect at module scope has no render to be stale relative to.
    { code: `useLeaderEffect(() => connect());` },
    // Not a callback we can read.
    { code: `function Chat() { useLeaderEffect(handler); return null; }` },
    // Not ours.
    { code: `function Chat({ roomId }) { useEffect(() => connect(roomId), []); return null; }` },
  ],
  invalid: [
    {
      code: `function Chat({ roomId }) {\n  useLeaderEffect(() => connect(roomId));\n  return null;\n}`,
      errors: [{ messageId: 'staleCapture', data: { name: 'roomId' } }],
    },
    {
      code: `function Chat({ roomId }) {\n  const url = \`wss://x/\${roomId}\`;\n  useLeaderEffect(function () { connect(url); });\n  return null;\n}`,
      errors: [{ messageId: 'staleCapture', data: { name: 'url' } }],
    },
    {
      code: `function Chat() {\n  const [open] = useState(false);\n  useLeaderEffect(() => { if (open) connect(); });\n  return null;\n}`,
      errors: [{ messageId: 'staleCapture', data: { name: 'open' } }],
    },
    // Nested scopes still capture, and one binding is reported once.
    {
      code: `function useSocket(roomId) {\n  useLeaderEffect(() => {\n    [1].forEach(() => connect(roomId));\n    return () => close(roomId);\n  });\n}`,
      errors: [{ messageId: 'staleCapture', data: { name: 'roomId' } }],
    },
    // Two captures, two reports.
    {
      code: `function Chat({ roomId, token }) {\n  useLeaderEffect(() => connect(roomId, token));\n  return null;\n}`,
      errors: [
        { messageId: 'staleCapture', data: { name: 'roomId' } },
        { messageId: 'staleCapture', data: { name: 'token' } },
      ],
    },
    // Declared without an initialiser, and destructured from something that is
    // not a hook: neither shape can vouch for stability.
    {
      code: `function Chat() {\n  let socket;\n  useLeaderEffect(() => socket?.close());\n  return null;\n}`,
      errors: [{ messageId: 'staleCapture', data: { name: 'socket' } }],
    },
    {
      code: `function Chat({ pair }) {\n  const [, second] = pair;\n  useLeaderEffect(() => connect(second));\n  return null;\n}`,
      errors: [{ messageId: 'staleCapture', data: { name: 'second' } }],
    },
    {
      code: `function Chat({ key }) {\n  const socket = sockets[key]();\n  useLeaderEffect(() => socket.close());\n  return null;\n}`,
      errors: [{ messageId: 'staleCapture', data: { name: 'socket' } }],
    },
    // A function declared in the component body closes over the same renders.
    {
      code: `function Chat({ roomId }) {\n  const start = () => connect(roomId);\n  useLeaderEffect(() => start());\n  return null;\n}`,
      errors: [{ messageId: 'staleCapture', data: { name: 'start' } }],
    },
  ],
});
