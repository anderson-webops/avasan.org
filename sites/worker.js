export default {
  fetch(request, env) {
    if (!env.ASSETS)
      return new Response('Static asset binding is unavailable.', { status: 503 })

    return env.ASSETS.fetch(request)
  },
}
