export async function onRequest(context) {
  const { request, env } = context;

  const USERNAME = env.LOGIN_USERNAME || "team";
  const PASSWORD = env.LOGIN_PASSWORD || "password";
  const SESSION_SECRET = env.SESSION_SECRET || "devsecret";

  const url = new URL(request.url);
  const cookie = request.headers.get("Cookie") || "";

  // allow already authenticated users
  if (cookie.includes(`session=${SESSION_SECRET}`)) {
    return context.next();
  }

  // handle login form
  if (request.method === "POST") {
    const formData = await request.formData();

    const username = formData.get("username");
    const password = formData.get("password");

    if (username === USERNAME && password === PASSWORD) {
      return new Response(null, {
        status: 302,
        headers: {
          "Set-Cookie": `session=${SESSION_SECRET}; Path=/; HttpOnly; Secure`,
          "Location": "/"
        }
      });
    }
  }

  // show login page
  return new Response(loginPage(), {
    headers: { "Content-Type": "text/html" }
  });
}

function loginPage() {
  return `
  <!DOCTYPE html>
  <html>
  <body style="font-family:Arial;display:flex;align-items:center;justify-content:center;height:100vh;background:#f5f5f5">
    <form method="POST" style="background:white;padding:40px;border-radius:8px">
      <h2>Team Login</h2>
      <input name="username" placeholder="Username" required /><br/><br/>
      <input name="password" type="password" placeholder="Password" required /><br/><br/>
      <button type="submit">Login</button>
    </form>
  </body>
  </html>
  `;
}
