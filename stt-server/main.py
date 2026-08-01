import tempfile, os
from fastapi import FastAPI, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

model = WhisperModel("small", device="cpu", compute_type="int8")

@app.post("/transcribe")
async def transcribe(file: UploadFile):
    suffix = os.path.splitext(file.filename)[1] or ".m4a"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        path = tmp.name

    try:
        segments, _ = model.transcribe(
            path, language="ko", vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500),
        )
        lines = []
        for s in segments:
            text = s.text.strip()
            if text:
                lines.append(text)
                print(f"[{int(s.start)//60:02d}:{int(s.start)%60:02d}] {text}")
        return {"text": "\n".join(lines)}
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass