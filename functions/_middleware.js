export async function onRequest(context) {

  const { LOGIN_USERNAME, LOGIN_PASSWORD, SESSION_SECRET } = context.env

  const cookie = context.request.headers.get("Cookie") || ""

  if (cookie.includes(`session=${SESSION_SECRET}`)) {
    return context.next()
  }

  if (context.request.method === "POST") {
    const formData = await context.request.formData()
    const username = formData.get("username")
    const password = formData.get("password")

    if (username === LOGIN_USERNAME && password === LOGIN_PASSWORD) {
      return new Response(null, {
        status: 302,
        headers: {
          "Set-Cookie": `session=${SESSION_SECRET}; Path=/; HttpOnly; Secure`,
          "Location": "/"
        }
      })
    }
  }

  return new Response(loginPage(), {
    headers: { "content-type": "text/html" }
  })
}
