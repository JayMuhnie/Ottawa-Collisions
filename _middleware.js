// Team login for the whole site (Cloudflare Pages Function: functions/_middleware.js).
//
// Required settings in Cloudflare (Settings → Variables and Secrets, Production):
//   LOGIN_USERNAME   LOGIN_PASSWORD   SESSION_SECRET (a long random string)
// If any is missing the site shows a "not configured" page and nobody can log in, instead of
// silently falling back to a guessable default. After changing a setting, redeploy.

const SESSION_DAYS = 7;
const COOKIE = "session";
const enc = new TextEncoder();

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// Compare without leaking where the first difference is (hash both sides first so lengths match).
async function safeEqual(a, b) {
  const [ha, hb] = await Promise.all([hmacHex("cmp", String(a)), hmacHex("cmp", String(b))]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return diff === 0;
}

function getCookie(request, name) {
  const m = (request.headers.get("Cookie") || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : null;
}

// Cookie value: "<expiry-unix-seconds>.<hmac of expiry>". Can't be forged without SESSION_SECRET.
async function makeSession(secret) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  return `${exp}.${await hmacHex(secret, String(exp))}`;
}

async function isValidSession(value, secret) {
  if (!value) return false;
  const [exp, sig] = value.split(".");
  if (!/^\d+$/.test(exp || "") || !sig) return false;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(sig, await hmacHex(secret, exp));
}

export async function onRequest(context) {
  const { request, env } = context;
  const { LOGIN_USERNAME, LOGIN_PASSWORD, SESSION_SECRET } = env;

  if (!LOGIN_USERNAME || !LOGIN_PASSWORD || !SESSION_SECRET || SESSION_SECRET.length < 16) {
    return page(
      "Login is not configured",
      "LOGIN_USERNAME, LOGIN_PASSWORD and SESSION_SECRET (at least 16 characters) must be set in Cloudflare Pages for this site, then redeploy.",
      "", 503
    );
  }

  if (await isValidSession(getCookie(request, COOKIE), SESSION_SECRET)) {
    return context.next();
  }

  const url = new URL(request.url);

  if (request.method === "POST") {
    let username = "", password = "";
    try {
      const form = await request.formData();
      username = String(form.get("username") ?? "");
      password = String(form.get("password") ?? "");
    } catch { /* fall through to error */ }

    const okUser = await safeEqual(username, LOGIN_USERNAME);
    const okPass = await safeEqual(password, LOGIN_PASSWORD);
    if (okUser && okPass) {
      return new Response(null, {
        status: 303,
        headers: {
          "Set-Cookie": `${COOKIE}=${await makeSession(SESSION_SECRET)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`,
          "Location": "/",
        },
      });
    }
    return page("Team Login", "", "Incorrect username or password.", 401);
  }

  // The app's data requests should get a clear error, not a login page they can't parse.
  if (url.pathname.startsWith("/api/")) {
    return new Response(JSON.stringify({ error: { message: "Not logged in. Reload the page and sign in." } }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  return page("Team Login", "", "", 200);
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function page(title, notice, error, status) {
  const form = notice ? `<p style="color:#555;max-width:300px;line-height:1.5">${esc(notice)}</p>` : `
      <input name="username" placeholder="Username" autocomplete="username" required /><br/><br/>
      <input name="password" type="password" placeholder="Password" autocomplete="current-password" required /><br/><br/>
      <button type="submit">Login</button>`;
  return new Response(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="font-family:Arial;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f5f5">
  <form method="POST" style="background:white;padding:40px;border-radius:8px">
    <h2>${esc(title)}</h2>
    ${error ? `<div style="color:#c0392b;margin-bottom:14px;font-size:14px">${esc(error)}</div>` : ""}
    ${form}
  </form>
</body></html>`, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
