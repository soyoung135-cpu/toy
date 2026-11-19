"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

import { createClient } from "./supabase-client";

export function LogoutButton() {
  const router = useRouter();

  async function logout() {
    await createClient().auth.signOut();
    router.push("/login");
    // 서버가 그리는 화면이 로그아웃 상태를 바로 반영하게 한다.
    router.refresh();
  }

  return (
    <Button variant="ghost" size="sm" onClick={logout}>
      로그아웃
    </Button>
  );
}
