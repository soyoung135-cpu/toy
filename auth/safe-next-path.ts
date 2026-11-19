/** 로그인 뒤 돌아갈 주소는 같은 사이트의 경로만 받는다. 그 밖의 값은 fallback으로 바꾼다. */
export function safeNextPath(path: unknown, fallback = "/", origin?: string): string {
  if (
    typeof path !== "string" ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.startsWith("/\\")
  ) {
    return fallback;
  }

  const currentOrigin = origin ?? window.location.origin;
  try {
    const url = new URL(path, currentOrigin);
    return url.origin === currentOrigin ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}
