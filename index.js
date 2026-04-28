import "dotenv/config";
import fs from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import express from "express";
import { WebSocketServer } from "ws";
import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import { fileURLToPath } from "node:url";
const scramjetPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "node_modules/@mercuryworkshop/scramjet/dist");
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";

// ── Supabase config ───────────────────────────────────────────────────────────
// Set these in your .env file:
//   SB_URL=https://your-project.supabase.co
//   SB_KEY=your-anon-key
const SB_URL = process.env.SB_URL || "https://ipnbmfhuxsokofhhlmhf.supabase.co";
const SB_KEY = process.env.SB_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwbmJtZmh1eHNva29maGhsbWhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4OTQ4OTYsImV4cCI6MjA5MjQ3MDg5Nn0.WykVrdpdgy0UukDrLS6NVJAsQgZpOTBj3bwPEEkGre4";

// ── Login page HTML (served at /login) ────────────────────────────────────────
// Styled to match your existing dark theme. Self-contained, no external deps.
const LOGIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sign In</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', system-ui, sans-serif;
    background: #0a0a0f;
    color: #e0e0e0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    width: 100%;
    max-width: 360px;
    padding: 0 20px;
  }
  .lock-icon { font-size: 48px; filter: drop-shadow(0 0 12px rgba(120,80,255,0.6)); }
  h1 {
    font-size: 1.1rem; font-weight: 400;
    letter-spacing: 0.08em; color: #aaa;
    text-transform: uppercase;
  }
  .input-wrap { position: relative; width: 100%; }
  input {
    width: 100%;
    padding: 13px 46px 13px 16px;
    background: #13131f;
    border: 1px solid #2a2a40;
    border-radius: 10px;
    color: #fff;
    font-size: 1rem;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  input:focus { border-color: #7850ff; box-shadow: 0 0 0 3px rgba(120,80,255,0.2); }
  .toggle-vis {
    position: absolute; right: 14px; top: 50%; transform: translateY(-50%);
    background: none; border: none; color: #555; cursor: pointer; font-size: 1rem;
    padding: 0; line-height: 1; transition: color 0.2s;
  }
  .toggle-vis:hover { color: #aaa; }
  #login-btn {
    width: 100%; padding: 14px;
    background: linear-gradient(135deg, #7850ff, #a040e0);
    border: none; border-radius: 10px; color: #fff;
    font-size: 1rem; font-weight: 600; letter-spacing: 0.05em;
    cursor: pointer; transition: opacity 0.2s;
  }
  #login-btn:hover { opacity: 0.88; }
  #login-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  #error-msg { color: #ff5577; font-size: 0.85rem; text-align: center; min-height: 18px; }
  .shake { animation: shake 0.4s ease; }
  @keyframes shake {
    0%,100% { transform: translateX(0); }
    20% { transform: translateX(-8px); }
    40% { transform: translateX(8px); }
    60% { transform: translateX(-6px); }
    80% { transform: translateX(6px); }
  }
</style>
</head>
<body>
<div class="card">
  <div class="lock-icon">⬡</div>
  <h1>Protected Content</h1>
  <div class="input-wrap">
    <input type="email" id="email" placeholder="Email address" autocomplete="email" />
  </div>
  <div class="input-wrap">
    <input type="password" id="pwd" placeholder="Password" autocomplete="current-password" />
    <button class="toggle-vis" id="toggle-vis" tabindex="-1" type="button">●</button>
  </div>
  <button id="login-btn">Sign In</button>
  <span id="error-msg"></span>
</div>
<script>
const SB_URL = ${JSON.stringify(SB_URL)};
const SB_KEY = ${JSON.stringify(SB_KEY)};

const emailEl   = document.getElementById('email');
const pwdEl     = document.getElementById('pwd');
const loginBtn  = document.getElementById('login-btn');
const errorMsg  = document.getElementById('error-msg');

// Show reason message if redirected from server
const params = new URLSearchParams(location.search);
if (params.get('reason') === 'elsewhere') {
  errorMsg.textContent = 'You have been signed in on another device.';
}

document.getElementById('toggle-vis').addEventListener('click', () => {
  pwdEl.type = pwdEl.type === 'password' ? 'text' : 'password';
});
emailEl.addEventListener('keydown', e => { if (e.key === 'Enter') pwdEl.focus(); });
pwdEl.addEventListener('keydown',   e => { if (e.key === 'Enter') login(); });
loginBtn.addEventListener('click', login);

function hdrs() {
  return { apikey: SB_KEY, 'Content-Type': 'application/json', Authorization: 'Bearer ' + SB_KEY };
}
function authHdrs(token) {
  return { apikey: SB_KEY, 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
}
function genToken() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now();
}

async function login() {
  const email = emailEl.value.trim(), password = pwdEl.value;
  if (!email || !password) { showError('Please enter your email and password.'); return; }
  loginBtn.disabled = true; loginBtn.textContent = 'Signing in…'; errorMsg.textContent = '';

  try {
    // 1. Authenticate
    const authRes = await fetch(SB_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: hdrs(),
      body: JSON.stringify({ email, password })
    });
    const data = await authRes.json();
    if (!data.access_token) {
      showError(data.error_description || data.msg || data.message || 'Invalid email or password.');
      return;
    }

    const { access_token, expires_in, user } = data;
    const userId = user.id;

    // 2. Check for existing active session on another device
    const chkRes = await fetch(SB_URL + '/rest/v1/active_sessions?user_id=eq.' + userId + '&select=token', {
      headers: authHdrs(access_token)
    });
    const existing = await chkRes.json();

    if (existing && existing.length > 0) {
      // Check if this browser already has a stored device token (same device re-login)
      const stored = getCookie('sb_dt');
      if (stored && stored === existing[0].token) {
        // Same device — clear old session and continue
        await fetch(SB_URL + '/rest/v1/active_sessions?user_id=eq.' + userId, {
          method: 'DELETE',
          headers: { ...authHdrs(access_token), Prefer: 'return=minimal' }
        });
      } else {
        showError('This account is currently in use on another device.');
        return;
      }
    }

    // 3. Register new session
    const deviceToken = genToken();
    await fetch(SB_URL + '/rest/v1/active_sessions', {
      method: 'POST',
      headers: { ...authHdrs(access_token), Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ user_id: userId, token: deviceToken, updated_at: new Date().toISOString() })
    });

    // 4. POST session to server — server sets an httpOnly cookie
    const saveRes = await fetch('/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token,
        expires_in,
        user_id: userId,
        device_token: deviceToken,
        email
      })
    });

    if (!saveRes.ok) { showError('Session error. Please try again.'); return; }

    // 5. Also store device token in a js-accessible cookie for same-device detection
    const expires = new Date(Date.now() + expires_in * 1000).toUTCString();
    document.cookie = 'sb_dt=' + deviceToken + '; expires=' + expires + '; path=/; SameSite=Lax';

    // 6. Redirect to originally requested page (or home)
    const next = params.get('next') || '/';
    location.replace(next);
  } catch (err) {
    showError('Network error. Please try again.');
    console.error(err);
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Sign In';
  }
}

function showError(msg) {
  errorMsg.textContent = msg;
  const card = document.querySelector('.card');
  card.classList.remove('shake');
  void card.offsetWidth; // reflow
  card.classList.add('shake');
  loginBtn.disabled = false;
  loginBtn.textContent = 'Sign In';
}

function getCookie(name) {
  return document.cookie.split('; ').find(c => c.startsWith(name + '='))?.split('=')[1] || null;
}
</script>
</body>
</html>`;

// ── Auth middleware helpers ────────────────────────────────────────────────────

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  for (const part of cookieHeader.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k) cookies[k.trim()] = decodeURIComponent(v.join('='));
  }
  return cookies;
}

function getSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  try {
    return cookies.sb_session ? JSON.parse(cookies.sb_session) : null;
  } catch {
    return null;
  }
}

function setSessionCookie(res, session) {
  const expires = new Date(session.expires_at * 1000).toUTCString();
  res.setHeader('Set-Cookie', [
    `sb_session=${encodeURIComponent(JSON.stringify(session))}; expires=${expires}; Path=/; HttpOnly; SameSite=Lax`,
  ]);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', [
    'sb_session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly; SameSite=Lax',
    'sb_dt=; expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Lax',
  ]);
}

async function validateSession(session) {
  if (!session || !session.access_token) return false;
  if (session.expires_at <= Math.floor(Date.now() / 1000)) return false;
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/active_sessions?user_id=eq.${session.user_id}&select=token`,
      {
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${session.access_token}`,
        },
        signal: AbortSignal.timeout(3000),
      }
    );
    if (!res.ok) return true; // allow through on DB errors
    const data = await res.json();
    return data && data.length > 0 && data[0].token === session.device_token;
  } catch {
    return true; // allow through on network timeout — don't lock out users
  }
}

// Paths that should NEVER require auth (static proxy paths, wisp, relay, login itself)
const AUTH_BYPASS_PREFIXES = [
  '/login',
  '/auth/',
  '/active/',
  '/scram/',
  '/libcurl/',
  '/baremux/',
  '/wisp/',
  '/relay/',
];

const STATIC_EXTENSIONS = new Set([
  ".wasm", ".js", ".css", ".dat", ".json", ".png", ".jpg", ".jpeg",
  ".gif", ".svg", ".ico", ".woff", ".woff2", ".ttf", ".eot", ".map",
  ".mp3", ".ogg", ".wav", ".mp4", ".webm", ".webp", ".pck", ".data",
  ".br", ".gz", ".dll", ".blat", ".bin", ".mem",
]);

// ── Auth gate middleware ───────────────────────────────────────────────────────
// Runs before everything else. Static assets are allowed through so the login
// page can load its own CSS/JS if needed. All HTML routes are protected.

async function authGate(req, res, next) {
  // Always allow bypass paths
  for (const prefix of AUTH_BYPASS_PREFIXES) {
    if (req.path.startsWith(prefix)) return next();
  }

  // Always allow static file extensions (so the login page assets load)
  const ext = path.extname(req.path).toLowerCase();
  if (ext && STATIC_EXTENSIONS.has(ext)) return next();

  // Check session
  const session = getSession(req);
  const valid = await validateSession(session);

  if (!valid) {
    // Evicted by another device
    if (session && !valid) clearSessionCookie(res);
    const redirectReason = session ? '?reason=elsewhere&' : '?';
    const next_path = encodeURIComponent(req.path);
    return res.redirect(`/login${redirectReason}next=${next_path}`);
  }

  next();
}

// ── Analytics snippet ─────────────────────────────────────────────────────────
const analyticsSnippet = `
<script async src="https://www.googletagmanager.com/gtag/js?id=G-PXHK7Q7G3Z"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-PXHK7Q7G3Z');
</script>
`;

const MAX_PLAYERS_PER_MATCH = 2;
const MATCH_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const app = express();
app.use(express.json());

// ── Auth gate (must be first) ─────────────────────────────────────────────────
app.use(authGate);

// ── Login page ────────────────────────────────────────────────────────────────
app.get('/login', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(LOGIN_HTML);
});

// ── Session save endpoint (called by login page JS) ───────────────────────────
app.post('/auth/session', (req, res) => {
  const { access_token, expires_in, user_id, device_token, email } = req.body;
  if (!access_token || !user_id || !device_token) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  const session = {
    access_token,
    expires_at: Math.floor(Date.now() / 1000) + Number(expires_in),
    user_id,
    device_token,
    email,
  };
  setSessionCookie(res, session);
  res.json({ ok: true });
});

// ── Logout endpoint ───────────────────────────────────────────────────────────
app.post('/auth/logout', async (req, res) => {
  const session = getSession(req);
  if (session) {
    try {
      await fetch(`${SB_URL}/rest/v1/active_sessions?user_id=eq.${session.user_id}`, {
        method: 'DELETE',
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${session.access_token}`,
          Prefer: 'return=minimal',
        },
      });
    } catch {}
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

// ── CORS / security headers ───────────────────────────────────────────────────
app.use((req, res, next) => {
  const isSearchViewer = req.path === "/search.html";
  const isScramBridge = req.path === "/scram/bridge.html";
  const isolate =
    req.path.startsWith("/tools/") ||
    req.path.endsWith(".html") ||
    req.path.endsWith(".js") ||
    req.path.endsWith(".wasm") ||
    req.path.includes("emulator") ||
    req.path.toLowerCase().endsWith(".iso") ||
    req.path.includes("psp") ||
    req.path.includes("game") ||
    req.path.includes("loader");

  if (req.path.includes("iframe.html")) {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  } else if (isolate && !isSearchViewer && !isScramBridge) {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  }
  if (
    req.path.includes("/active/") ||
    req.path.includes("/scram/") ||
    req.path.includes("/libcurl/") ||
    req.path.includes("/baremux/")
  ) {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  next();
});

// ── Brotli helper ─────────────────────────────────────────────────────────────
function serveBrotli(contentType) {
  return (req, res, next) => {
    const brPath  = path.join(process.cwd(), "public", req.path + ".br");
    const rawPath = path.join(process.cwd(), "public", req.path);
    if (fs.existsSync(brPath)) {
      res.set("Content-Encoding", "br");
      res.set("Content-Type", contentType);
      res.sendFile(brPath);
    } else if (fs.existsSync(rawPath)) {
      res.set("Content-Type", contentType);
      res.sendFile(rawPath);
    } else {
      next();
    }
  };
}

app.get(/\.dat$/,  serveBrotli("application/octet-stream"));
app.get(/\.data$/, serveBrotli("application/octet-stream"));
app.get(/\.pck$/,  serveBrotli("application/octet-stream"));
app.get(/\.wasm$/, serveBrotli("application/wasm"));
app.get(/\.js$/,   serveBrotli("application/javascript"));

app.use(express.static("public"));
app.use(express.static("assets"));
app.use("/active/",  express.static(uvPath));
app.use("/scram/",   express.static(scramjetPath));
app.use("/libcurl/", express.static(libcurlPath));
app.use("/baremux/", express.static(baremuxPath));

// ── HTML routes ───────────────────────────────────────────────────────────────
const routes = [
  { path: "/",    file: "index.html" },
  { path: "/g",   file: "games.html" },
  { path: "/a",   file: "apps.html" },
  { path: "/i",   file: "iframe.html" },
  { path: "/u",   file: "unityframe.html" },
  { path: "/p",   file: "profile.html" },
  { path: "/t",   file: "tools.html" },
  { path: "/s",   file: "settings.html" },
  { path: "/404", file: "404.html" },
];

routes.forEach((route) => {
  app.get(route.path, (req, res) => {
    const filePath = path.join(process.cwd(), "public", route.file);
    fs.readFile(filePath, "utf8", (err, data) => {
      if (err) {
        console.error("Error loading page:", err);
        return res.status(500).send("Error loading page");
      }
      let html = data;
      if (html.includes("</head>")) {
        html = html.replace("</head>", `${analyticsSnippet}\n</head>`);
      }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.send(html);
    });
  });
});

app.use((req, res) => {
  const ext = path.extname(req.path).toLowerCase();
  if (STATIC_EXTENSIONS.has(ext)) return res.status(404).end();
  res.redirect("/404");
});

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = createServer();
logging.set_level(logging.DEBUG);
wisp.options.dns_method = "resolve";
wisp.options.dns_servers = ["1.1.1.1", "1.0.0.1", "8.8.8.8", "8.8.4.4"];
wisp.options.dns_result_order = "ipv4first";
wisp.options.allow_udp = true;
wisp.options.timeout = 30000;

server.on("request", (req, res) => { app(req, res); });

// ── Multiplayer relay (Yomi Hustle) ───────────────────────────────────────────
const relayWss = new WebSocketServer({ noServer: true });
let nextClientId = 1;
const clients = new Map();
const rooms = new Map();

function send(ws, payload) {
  if (!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify(payload));
}
function sendToClient(clientId, payload) {
  const client = clients.get(clientId);
  if (!client) return;
  send(client.ws, { client_id: client.id, ...payload });
}
function sendError(clientId, message) {
  sendToClient(clientId, { type: "game_error", message });
}
function generateMatchCode() {
  for (;;) {
    let code = "";
    for (let i = 0; i < 6; i += 1)
      code += MATCH_CODE_ALPHABET[Math.floor(Math.random() * MATCH_CODE_ALPHABET.length)];
    if (!rooms.has(code)) return code;
  }
}
function buildMatchList() {
  return Array.from(rooms.values())
    .filter(r => r.public && r.members.size < MAX_PLAYERS_PER_MATCH)
    .map(r => ({ host: r.hostName, code: r.code }));
}
function sendMatchList(clientId) {
  sendToClient(clientId, { type: "match_list", list: buildMatchList() });
}
function broadcastPlayerCount() {
  for (const clientId of clients.keys())
    sendToClient(clientId, { type: "player_count", count: clients.size });
}
function refreshLobbyState() {
  for (const clientId of clients.keys()) sendMatchList(clientId);
  broadcastPlayerCount();
}
function getRoomMembers(room) {
  return Array.from(room.members).map(id => clients.get(id)).filter(Boolean).sort((a, b) => a.id - b.id);
}
function sendRegisterSync(room) {
  const members = getRoomMembers(room);
  for (const target of members)
    for (const member of members)
      sendToClient(target.id, { type: "player_registered", name: member.playerName, id: member.id, version: member.version });
}
function closeRoom(room, disconnectedId) {
  for (const memberId of Array.from(room.members)) {
    const member = clients.get(memberId);
    if (member) member.roomCode = null;
    sendToClient(memberId, { type: "peer_disconnected", id: disconnectedId });
  }
  rooms.delete(room.code);
}
function leaveRoom(client) {
  if (!client || !client.roomCode) return;
  const room = rooms.get(client.roomCode);
  client.roomCode = null;
  if (!room) return;
  room.members.delete(client.id);
  if (room.members.size === 0) { rooms.delete(room.code); refreshLobbyState(); return; }
  if (room.hostId === client.id) { closeRoom(room, client.id); refreshLobbyState(); return; }
  for (const memberId of room.members)
    sendToClient(memberId, { type: "peer_disconnected", id: client.id });
  refreshLobbyState();
}
function createRoomForClient(client, publicMatch) {
  leaveRoom(client);
  const code = generateMatchCode();
  const room = { code, public: Boolean(publicMatch), hostId: client.id, hostName: client.playerName, version: client.version, members: new Set([client.id]) };
  rooms.set(code, room);
  client.roomCode = code;
  sendToClient(client.id, { type: "match_created", code });
  sendRegisterSync(room);
  refreshLobbyState();
}
function joinRoomForClient(client, roomCode) {
  leaveRoom(client);
  const code = String(roomCode || "").trim().toUpperCase();
  if (!code) { sendToClient(client.id, { type: "room_join_deny", message: "Invalid room code." }); return; }
  const room = rooms.get(code);
  if (!room) { sendToClient(client.id, { type: "room_join_deny", message: "Room not found." }); return; }
  if (room.members.size >= MAX_PLAYERS_PER_MATCH) { sendToClient(client.id, { type: "room_join_deny", message: "Room is full." }); return; }
  room.members.add(client.id);
  client.roomCode = code;
  sendToClient(client.id, { type: "room_join_confirm" });
  sendRegisterSync(room);
  refreshLobbyState();
}
function handleRelayRpc(client, message) {
  if (!client.roomCode) return;
  const room = rooms.get(client.roomCode);
  if (!room) return;
  for (const memberId of room.members) {
    if (memberId === client.id) continue;
    sendToClient(memberId, { type: "relay_rpc", function_name: message.function_name, arg: Object.prototype.hasOwnProperty.call(message, "arg") ? message.arg : null });
  }
}
function handleMessage(client, raw) {
  let message = null;
  try { message = JSON.parse(Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw)); }
  catch { sendError(client.id, "Invalid message."); return; }
  if (!message || typeof message !== "object") { sendError(client.id, "Invalid message."); return; }
  switch (message.type) {
    case "create_match":
      client.playerName = String(message.player_name || `Player ${client.id}`).slice(0, 32);
      client.version = Object.prototype.hasOwnProperty.call(message, "version") ? message.version : null;
      createRoomForClient(client, message.public); break;
    case "player_join_game":
      client.playerName = String(message.player_name || `Player ${client.id}`).slice(0, 32);
      client.version = Object.prototype.hasOwnProperty.call(message, "version") ? message.version : null;
      joinRoomForClient(client, message.room_code); break;
    case "fetch_match_list":   sendMatchList(client.id); break;
    case "fetch_player_count": sendToClient(client.id, { type: "player_count", count: clients.size }); break;
    case "relay_rpc":          handleRelayRpc(client, message); break;
    default: sendError(client.id, "Unknown message type."); break;
  }
}

relayWss.on("connection", (ws) => {
  const client = { id: nextClientId++, ws, playerName: "", version: null, roomCode: null };
  clients.set(client.id, client);
  sendToClient(client.id, { type: "welcome" });
  sendMatchList(client.id);
  broadcastPlayerCount();
  ws.on("message", raw => handleMessage(client, raw));
  ws.on("close", () => { leaveRoom(client); clients.delete(client.id); refreshLobbyState(); });
  ws.on("error", () => { leaveRoom(client); clients.delete(client.id); refreshLobbyState(); });
});

server.on("upgrade", (req, socket, head) => {
  if (req.url.startsWith("/wisp/")) {
    try { wisp.routeRequest(req, socket, head); } catch (error) { console.error("Wisp upgrade error:", error); socket.destroy(); }
    return;
  }
  if (req.url.startsWith("/relay/")) {
    relayWss.handleUpgrade(req, socket, head, ws => relayWss.emit("connection", ws, req));
    return;
  }
  socket.end();
});

server.on("error", error => { console.error("Server error:", error); });

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`Relay running on ws://localhost:${port}/relay/`);
});
