export interface SpeechPort {
  /** 마이크로 영어 한 문장을 듣고 받아 적은 글자를 돌려준다. 실패하면 오류 이름을 message에 담아 던진다. */
  listen(): Promise<string>;
  /** 영어 문장을 소리로 읽고, 다 읽으면 끝난다. */
  speak(text: string): Promise<void>;
  /** 듣기와 읽기를 즉시 멈춘다. */
  stop?(): void;
}

interface RecognitionResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}

type RecognitionConstructor = new () => RecognitionLike;

function findRecognition(): RecognitionConstructor | undefined {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/** 브라우저의 Web Speech API를 쓴다. window는 호출 시점에만 만지므로 서버 렌더링에서 안전하다. */
export function createBrowserSpeech(): SpeechPort {
  let recognition: RecognitionLike | null = null;

  return {
    listen() {
      return new Promise<string>((resolve, reject) => {
        const Recognition = findRecognition();
        if (!Recognition) {
          reject(new Error("unsupported"));
          return;
        }
        const instance = new Recognition();
        instance.lang = "en-US";
        instance.continuous = false;
        instance.interimResults = false;
        instance.maxAlternatives = 1;

        let transcript = "";
        instance.onresult = (event) => {
          transcript = event.results[0]?.[0]?.transcript ?? "";
        };
        instance.onerror = (event) => reject(new Error(event.error));
        instance.onend = () => {
          if (transcript.trim()) resolve(transcript.trim());
          else reject(new Error("no-speech"));
        };
        recognition = instance;
        instance.start();
      });
    },

    speak(text) {
      return new Promise<void>((resolve) => {
        const synth = window.speechSynthesis;
        if (!synth) {
          resolve();
          return;
        }
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "en-US";
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        synth.speak(utterance);
      });
    },

    stop() {
      recognition?.abort();
      window.speechSynthesis?.cancel();
    },
  };
}
