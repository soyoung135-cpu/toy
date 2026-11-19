# LLM 제공자와 모델 선택

## Decisions

- LLM 호출은 OpenAI API를 직접 쓴다(Responses API, `POST /v1/responses`). 키는 `OPENAI_API_KEY` 환경 변수에 둔다.
- 페르소나와 실시간으로 주고받는 대화 응답은 `gpt-6-luna`를 쓰고, `reasoning.effort`는 `low`로 둔다.
- 대화가 끝난 뒤 한 번 만드는 교정(단어·문장 교정, 이후 발음 피드백 포함)은 같은 `gpt-6-luna`에 `reasoning.mode: "pro"`를 켜서 쓴다. 교정 품질 기준(해당 spec의 교정 정확도 eval)을 통과하지 못하면 `gpt-6.1-terra`로 올린다.
- 모델은 버전이 고정된 ID로 지정한다. 항상 최신으로 연결되는 별칭은 쓰지 않는다.
- 요청에는 `store: false`를 보내 대화 내용이 OpenAI에 저장되지 않게 한다.

## Boundaries

- 두 용도 밖의 새 LLM 호출(예: 페르소나 생성, 막힐 때 힌트)은 이 결정이 정하지 않는다. 그 작업에서 응답 속도와 품질 요구를 보고 따로 정하되, 제공자는 OpenAI를 쓴다.
- 모델 이름이 바뀌어도 "대화는 빠르고 싼 설정, 대화 후 교정은 더 깊이 생각하는 설정"이라는 나눔은 유지한다.
- Luna는 Chat Completions에서 함수 호출이 `reasoning_effort: "none"`일 때만 된다. 도구 호출이 필요한 기능은 Responses API를 쓴다.

## Why

개인용이라 상용 앱 구독료 같은 비용 부담이 없어야 한다(`PRODUCT.md`). 2026-11-19 OpenAI 공식 모델 문서 기준 `gpt-6-luna`는 1M 토큰당 입력 $0.10, 출력 $0.50이고, 같은 모델의 pro 모드는 단가는 같지만 생각 토큰을 훨씬 많이 쓴다. 출퇴근 하루 2회, 회당 20턴과 교정 1회로 추정하면 월 $1 안팎이다. 대안인 `gpt-6.1-terra`는 $1 / $5라 약 10배다.

사용자가 OpenAI API 키를 이미 발급받았고(사용자 확정), 직접 호출하면 OpenRouter를 거칠 때 붙는 크레딧 충전 수수료(5.5%)와 중간 경유 지연이 없다. 처음에는 OpenRouter로 정했으나, 쓸 모델이 OpenAI 모델 하나뿐이라 여러 회사 모델을 바꿔 쓰는 이점이 줄어 직접 호출로 바꿨다.

음성 대화는 응답이 늦으면 흐름이 끊기므로 실시간 대화에는 생각을 줄인 Luna(`low`)가 맞다. 교정은 틀리면 학습을 해치므로 같은 모델을 pro 모드로 돌리고, 품질 기준으로 지킨다. OpenAI 직접 호출에는 `gpt-6-luna-pro`라는 별도 모델 ID가 없고 pro는 `reasoning.mode` 옵션이다(OpenRouter에서만 별도 ID로 보인다).

별칭은 새 모델이 나올 때 알림 없이 바뀌어 eval을 통과했던 동작이 모르는 사이 달라질 수 있어 고정 ID를 쓴다(사용자 확정).

## Reconsider when

- 실제 사용에서 Luna의 대화 품질(페르소나 유지, 쉬운 말투)이 연습에 방해될 만큼 떨어질 때
- 새 Luna 세대가 나올 때(eval을 다시 돌려 통과하면 ID를 올린다)
- 월 사용 비용이 위 추정의 두 배를 넘을 때
- OpenAI 모델만으로 부족해 다른 회사 모델을 함께 써야 할 때(그때 OpenRouter를 다시 본다)

## Still-rejected alternatives

- OpenRouter 경유 — 여러 회사 모델을 ID 하나로 바꿔 볼 수 있지만, 충전 수수료 5.5%(최소 $0.80)가 붙고 쓸 모델이 하나라 이점이 작다; 다른 회사 모델이 필요해지면 다시 본다.
- Anthropic API 직접 호출(대화 Haiku 5.5, 교정 Sonnet 5.5) — 처음 정했던 조합이다. 사용자가 OpenAI 키를 발급받았고 교정 비용이 더 든다.
- 항상 최신 별칭 사용 — 위 Why의 이유로 쓰지 않는다.
