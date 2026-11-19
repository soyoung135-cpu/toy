import { expect, test } from "vitest";

import { safeNextPath } from "./safe-next-path";

const ORIGIN = "http://localhost:3000";

test("같은 사이트의 경로는 그대로 돌려준다", () => {
  expect(safeNextPath("/foo?x=1#h", "/", ORIGIN)).toBe("/foo?x=1#h");
  expect(safeNextPath("/", "/home", ORIGIN)).toBe("/");
});

test.each([
  "https://evil.com",
  "//evil.com/x",
  "/\\evil.com",
  "javascript:alert(1)",
  "foo",
  "",
  null,
  undefined,
  42,
])("다른 사이트나 경로가 아닌 값 %j 는 기본값으로 바꾼다", (value) => {
  expect(safeNextPath(value, "/", ORIGIN)).toBe("/");
});

test("기본값을 지정할 수 있다", () => {
  expect(safeNextPath("https://evil.com", "/home", ORIGIN)).toBe("/home");
});
