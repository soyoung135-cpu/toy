import { isAuthConfigured, isLoginDisabled, isProduction } from "./config";
import { createServerSupabase } from "./supabase-server";

/**
 * API 핸들러 앞에서 로그인을 확인한다. 막아야 하면 돌려줄 응답을, 통과면 null을 돌려준다.
 * proxy와 별개로 한 번 더 확인해서, 요청 앞단 설정이 어긋나도 AI 호출이 열리지 않게 한다.
 */
export async function requireUser(): Promise<Response | null> {
  if (isLoginDisabled()) return null;
  if (!isAuthConfigured()) {
    return isProduction()
      ? Response.json({ error: "auth_not_configured" }, { status: 503 })
      : null;
  }
  try {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    return null;
  } catch (error) {
    // 확인하지 못했으면 열어 두지 않는다. 원인은 메시지만 로그에 남긴다.
    console.error(`[auth] ${error instanceof Error ? error.message : "unknown error"}`);
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
}
