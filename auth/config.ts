// Supabase 환경 값이 모두 있어야 로그인 보호가 켜진다.
export function isAuthConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

// 임시 스위치: true면 로그인 없이 화면과 API가 모두 열린다. 로그인 보호를 되살리려면 false로 바꾼다.
// 켜 두면 배포 주소를 아는 누구나 대화를 호출해 OpenAI 사용량을 쓸 수 있다.
const LOGIN_DISABLED = true;

export function isLoginDisabled(): boolean {
  return LOGIN_DISABLED;
}

// 설정이 없을 때 개발 환경은 로그인 없이 쓰고, 운영 환경은 모두 막는다(docs/decisions/deployment.md).
export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
