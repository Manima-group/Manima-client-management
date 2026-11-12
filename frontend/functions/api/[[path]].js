export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const target = env.API_URL.replace(/\/$/, "") + url.pathname + url.search;
  return fetch(new Request(target, request));
}
