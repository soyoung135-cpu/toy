import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import Home from "@/app/page";

test("홈 화면은 새 대화를 시작할 수 있는 버튼을 보여준다", () => {
  render(<Home />);

  expect(screen.getByRole("button", { name: "새 대화" })).toBeInTheDocument();
});
