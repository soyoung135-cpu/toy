import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// 서버(Route Handler, Server Component)에서 쓰는 클라이언트. 요청마다 새로 만든다.
export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component에서는 쿠키를 쓸 수 없다. 세션 갱신은 proxy가 맡으므로 무시해도 된다.
          }
        },
      },
    },
  );
}
