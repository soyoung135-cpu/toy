// Supabase 환경 값이 모두 있어야 로그인 보호가 켜진다.
export function isAuthConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

// 설정이 없을 때 개발 환경은 로그인 없이 쓰고, 운영 환경은 모두 막는다(docs/decisions/deployment.md).
export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
