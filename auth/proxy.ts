import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isAuthConfigured, isProduction } from "./config";

const LOGIN_PATH = "/login";
const CACHE_HEADERS = ["cache-control", "expires", "pragma"];

/**
 * 요청마다 세션을 갱신하고, 로그인하지 않은 요청을 막는다.
 * 화면은 로그인 화면으로 보내고, API는 401로 거절한다.
 * 확인 중에 예외가 나면(예: 환경 값 URL이 잘못됨) 열어 두지 않고 503으로 막고 원인을 로그에 남긴다.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  try {
    return await handleRequest(request);
  } catch (error) {
    // 메시지만 남긴다. 환경 값(URL, 키)은 로그에 넣지 않는다.
    console.error(`[auth] ${error instanceof Error ? error.message : "unknown error"}`);
    return NextResponse.json({ error: "auth_unavailable" }, { status: 503 });
  }
}

async function handleRequest(request: NextRequest): Promise<NextResponse> {
  if (!isAuthConfigured()) {
    // 설정이 없으면 개발 환경은 로그인 없이 쓰고, 운영 환경은 모두 막는다.
    return isProduction()
      ? NextResponse.json({ error: "auth_not_configured" }, { status: 503 })
      : NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          // 세션이 담긴 응답이 CDN에 캐시되지 않게 한다.
          Object.entries(headers ?? {}).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value),
          );
        },
      },
    },
  );

  // createServerClient와 getClaims 사이에 다른 코드를 넣지 않는다. 사용자가 무작위로 로그아웃될 수 있다.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname, search } = request.nextUrl;

  // 갱신된 세션 쿠키와 캐시 헤더를 다른 응답에도 그대로 옮긴다.
  const withSession = (response: NextResponse) => {
    supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
    CACHE_HEADERS.forEach((key) => {
      const value = supabaseResponse.headers.get(key);
      if (value) response.headers.set(key, value);
    });
    return response;
  };

  if (!signedIn) {
    if (pathname.startsWith("/api/")) {
      return withSession(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
    }
    if (pathname === LOGIN_PATH) return supabaseResponse;
    const url = request.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.search = "";
    url.searchParams.set("next", `${pathname}${search}`);
    return withSession(NextResponse.redirect(url));
  }

  if (pathname === LOGIN_PATH) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return withSession(NextResponse.redirect(url));
  }

  // 이 응답 객체를 그대로 돌려줘야 브라우저와 서버의 세션이 어긋나지 않는다.
  return supabaseResponse;
}
