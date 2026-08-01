# 회의록 자동화 (Meeting Minutes Bot)

녹음/오디오 파일을 받아써서 회의록으로 정리하고 PDF로 저장하는 앱입니다.

- 프론트엔드: React + Vite (`localhost:5173`)
- STT 서버: 로컬 Whisper 서버 (`localhost:8000`) — mp3 등 오디오 파일을 텍스트로 변환
- 요약: 브라우저 안에서 키워드/패턴 매칭으로 회의록을 정리 (외부 API 호출 없음, API 키 불필요)

## 실행 방법

두 서버(프론트엔드 + STT 서버)를 각각 켜야 합니다.

### 1. 프론트엔드

```
npm install
npm run dev
```

`http://localhost:5173` 접속.

### 2. STT 서버 (오디오 파일 인식용)

```
cd stt-server
pip install fastapi uvicorn faster-whisper
python -m uvicorn main:app --port 8000
```

앱의 "파일" 탭에서 서버 주소 칸에 `http://localhost:8000/transcribe` 를 입력한 뒤 오디오 파일을 선택하면 받아쓰기가 진행됩니다.

- 기본 모델은 `small` (CPU, int8)입니다. 오래된 CPU에서는 20분짜리 파일이 20~40분 이상 걸릴 수 있습니다 — `stt-server/main.py`의 `WhisperModel("small", ...)` 부분을 `"base"`나 `"tiny"`로 바꾸면 더 빨라지는 대신 정확도는 낮아집니다.
- Windows에서는 `ctranslate2` 실행에 Visual C++ 재배포 패키지가 필요할 수 있습니다.

### 3. 마이크로 실시간 받아쓰기 (STT 서버 없이 사용 가능)

"녹음" 탭은 브라우저 내장 Web Speech API를 사용하므로 별도 서버 없이 Chrome에서 바로 동작합니다.

### 4. 회의록 요약

"회의록으로 정리" 버튼은 외부 API 없이 `src/App.jsx`의 `summarize` 함수가 브라우저에서 직접 처리합니다. 발언자(`이름: 내용` 형식)와 "확정", "까지", "다음 회의" 같은 키워드를 기준으로 결정 사항/실행 항목/차기 회의를 뽑아내는 방식이라, 회의록 형식이 아닌 텍스트를 넣으면 정리가 부정확할 수 있습니다.

## 폴더 구조

```
src/            React 프론트엔드
stt-server/     로컬 Whisper STT 서버 (FastAPI)
```
