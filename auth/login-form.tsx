"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { safeNextPath } from "./safe-next-path";
import { createClient } from "./supabase-client";

const WRONG_CREDENTIALS = "이메일 또는 비밀번호가 올바르지 않습니다.";
const TRY_LATER = "로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.";

interface SignInError {
  status?: number;
  code?: string;
}

// 틀린 이메일·비밀번호만 그렇게 안내하고, 연결 오류나 제한 같은 다른 실패는 따로 안내한다.
function isWrongCredentials(error: SignInError): boolean {
  return error.code === "invalid_credentials" || error.status === 400;
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(isWrongCredentials(signInError) ? WRONG_CREDENTIALS : TRY_LATER);
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next");
      router.push(safeNextPath(next, "/"));
      // 서버가 그리는 화면(로그아웃 버튼 등)이 로그인 상태를 바로 반영하게 한다.
      router.refresh();
    } catch {
      setError(TRY_LATER);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>로그인</CardTitle>
        <CardDescription>영어 회화 연습을 쓰려면 로그인해 주세요.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">이메일</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">비밀번호</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" size="lg" disabled={isLoading}>
            {isLoading ? "로그인하는 중..." : "로그인"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
