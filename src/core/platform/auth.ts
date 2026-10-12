export const redirectToSignIn = (request: Request) => {
  const url = new URL(request.url)
  const next = `${url.pathname}${url.search}`

  return Response.redirect(new URL(`/signin?next=${encodeURIComponent(next)}`, url).toString(), 303)
}
