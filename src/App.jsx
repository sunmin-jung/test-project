import React, { useState, useRef, useEffect, useCallback } from 'react';

const T = {
  desk: '#E9EAEC',
  panel: '#FFFFFF',
  rule: '#D3D7DC',
  ruleSoft: '#E7E9EC',
  ink: '#171B21',
  ink70: '#4B535E',
  ink45: '#7C858F',
  seal: '#C8352B',
  sealSoft: '#FBEDEC',
  ok: '#2E6B52',
};
const MONO = "'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace";
const SANS =
  "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', sans-serif";

const SAMPLE = `김지훈: 자 그럼 시작할게요. 오늘 주간회의 시작하겠습니다. 어 참석은 저랑 박서연 팀장님, 이도현님, 최은비님이요.
박서연: 네 먼저 지난주 배포부터요. 결제 모듈 v2 배포는 목요일에 나갔고요, 롤백 없이 잘 올라갔습니다.
이도현: 근데 배포 이후에 결제 실패율이 좀 올라갔어요. 0.4%에서 1.1%로요. 로그 보니까 카드사 타임아웃이 대부분이더라고요.
박서연: 아 그거는 재시도 로직이 없어서 그런 것 같은데요.
이도현: 네 맞아요. 그래서 지수 백오프로 재시도 3회 넣는 걸로 하려고 하는데 어떠세요.
김지훈: 좋아요. 그거 이번 스프린트 안에 처리하죠. 도현님이 맡아주시고 다음주 수요일까지 가능할까요.
이도현: 네 가능합니다.
최은비: 그리고 어 신규 온보딩 화면 사용자 테스트 결과 공유드릴게요. 8명 중에 6명이 두 번째 단계에서 이탈했어요.
최은비: 약관 동의 화면이 너무 길다는 피드백이 제일 많았고요, 그 다음이 뭐였지 아 진행률 표시가 없어서 언제 끝나는지 모르겠다는 의견이었어요.
박서연: 약관은 법무팀 확인이 필요해서 바로 줄이기는 어렵고, 진행률 바는 바로 넣을 수 있을 것 같아요.
김지훈: 그러면 진행률 바는 은비님이 다음주까지 디자인 시안 주시고, 약관 축약은 제가 법무팀에 문의 넣을게요.
김지훈: 마지막으로 채용은 백엔드 두 분 서류 통과했고 다음주 화요일에 1차 면접 잡혀 있습니다.
박서연: 면접관은 저랑 도현님으로 들어갈게요.
김지훈: 네 그럼 오늘은 여기까지 하고 다음 회의는 다음주 월요일 같은 시간에 하겠습니다. 수고하셨습니다.`;

function useScript() {
  return useCallback((src) => {
    return new Promise((resolve, reject) => {
      if ([...document.scripts].some((s) => s.src === src)) return resolve();
      const el = document.createElement('script');
      el.src = src;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error('스크립트를 불러오지 못했습니다'));
      document.head.appendChild(el);
    });
  }, []);
}

export default function MeetingMinutesBot() {
  const [tab, setTab] = useState('mic');
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [recording, setRecording] = useState(false);
  const [sttUrl, setSttUrl] = useState('');
  const [busy, setBusy] = useState(null);
  const [minutes, setMinutes] = useState(null);
  const [rawFallback, setRawFallback] = useState('');
  const [note, setNote] = useState(null);
  const [pdfDone, setPdfDone] = useState(false);
  const [meta, setMeta] = useState({ title: '', date: '', attendees: '' });

  const recRef = useRef(null);
  const docRef = useRef(null);
  const loadScript = useScript();

  const stages = [
    {
      n: '01',
      label: '음성',
      state: transcript || recording ? (recording ? 'run' : 'done') : 'idle',
    },
    {
      n: '02',
      label: '받아쓰기',
      state: busy === 'stt' ? 'run' : transcript ? 'done' : 'idle',
    },
    {
      n: '03',
      label: '요약',
      state: busy === 'summary' ? 'run' : minutes ? 'done' : 'idle',
    },
    {
      n: '04',
      label: 'PDF',
      state: busy === 'pdf' ? 'run' : pdfDone ? 'done' : 'idle',
    },
  ];

  const startMic = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setNote({
        kind: 'error',
        text: "이 브라우저는 실시간 받아쓰기를 지원하지 않습니다. Chrome에서 열거나 '파일'·'직접 입력' 탭을 사용하세요.",
      });
      return;
    }
    try {
      const rec = new SR();
      rec.lang = 'ko-KR';
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e) => {
        let fin = '',
          itm = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) fin += t + ' ';
          else itm += t;
        }
        if (fin) setTranscript((p) => (p ? p + ' ' : '') + fin.trim());
        setInterim(itm);
      };
      rec.onerror = (e) => {
        setRecording(false);
        setNote({
          kind: 'error',
          text:
            e.error === 'not-allowed'
              ? '마이크 권한이 거부됐습니다. 브라우저 주소창의 자물쇠에서 마이크를 허용해 주세요.'
              : `받아쓰기 오류: ${e.error}`,
        });
      };
      rec.onend = () => {
        setRecording(false);
        setInterim('');
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
      setNote(null);
    } catch {
      setNote({
        kind: 'error',
        text: '마이크를 시작할 수 없습니다. 새 창에서 열거나 직접 입력을 사용하세요.',
      });
    }
  };
  const stopMic = () => {
    recRef.current?.stop();
    setRecording(false);
  };
  useEffect(() => () => recRef.current?.stop(), []);

  const onFile = async (file) => {
    if (!file) return;
    if (!sttUrl.trim()) {
      setNote({
        kind: 'info',
        text: "오디오 파일을 텍스트로 바꾸려면 Whisper 서버 주소가 필요합니다. 위 칸에 주소를 넣거나, 받아쓴 결과를 '직접 입력'에 붙여넣으세요.",
      });
      return;
    }
    setBusy('stt');
    setNote(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(sttUrl.trim(), { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`서버 응답 ${res.status}`);
      const data = await res.json();
      const text = data.text || data.transcript || '';
      if (!text) throw new Error('응답에 text 필드가 없습니다');
      setTranscript((p) => (p ? p + '\n' : '') + text);
    } catch (err) {
      setNote({ kind: 'error', text: `받아쓰기 실패: ${err.message}` });
    } finally {
      setBusy(null);
    }
  };

  const summarize = async () => {
    if (transcript.trim().length < 30) {
      setNote({
        kind: 'error',
        text: '요약하려면 전사 내용이 조금 더 필요합니다.',
      });
      return;
    }
    setBusy('summary');
    setNote(null);
    setRawFallback('');
    setPdfDone(false);
    await new Promise((r) => setTimeout(r, 350));

    const clean = (s) =>
      s
        .replace(/(^|\s)(어+|음+|아+|그+|자|저기|뭐지|네)(\s|,|$)/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const cut = (t, n) => (t.length > n ? t.slice(0, n) + '…' : t);
    const has = (t, ks) => ks.some((k) => t.includes(k));

    const rows = transcript
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const m = l.match(/^([가-힣A-Za-z]{2,10})\s*[::]\s*(.+)$/);
        return m
          ? { who: m[1], text: clean(m[2]) }
          : { who: '', text: clean(l) };
      })
      .filter((r) => r.text.length > 5);

    if (!rows.length) {
      setNote({
        kind: 'error',
        text: '정리할 문장을 찾지 못했습니다. 줄바꿈으로 발언을 구분해 주세요.',
      });
      setBusy(null);
      return;
    }

    const attendees = [...new Set(rows.map((r) => r.who).filter(Boolean))];

    const decisions = rows
      .filter((r) =>
        has(r.text, [
          '하기로',
          '하죠',
          '하겠습니다',
          '확정',
          '결정',
          '가능합니다',
          '진행하',
        ]),
      )
      .map((r) => cut(r.text, 70))
      .slice(0, 5);

    const actionItems = rows
      .filter((r) =>
        has(r.text, [
          '까지',
          '맡아',
          '담당',
          '주세요',
          '할게요',
          '드릴게요',
          '넣을게요',
        ]),
      )
      .map((r) => {
        const d = r.text.match(
          /(다음\s*주|이번\s*주|내일|모레)?\s*[월화수목금토일]?요일?\s*까지/,
        );
        return {
          owner: r.who || '미정',
          task: cut(r.text, 60),
          due: d ? d[0].replace(/\s*까지/, '').trim() : '미정',
        };
      })
      .slice(0, 6);

    const body = rows.filter((r) => r.text.length > 15);
    const size = Math.max(1, Math.ceil(body.length / 3));
    const topics = [0, 1, 2]
      .map((i) => body.slice(i * size, (i + 1) * size))
      .filter((g) => g.length)
      .map((g) => ({
        heading: cut(g[0].text, 24),
        points: g.slice(0, 3).map((r) => cut(r.text, 70)),
      }));

    const summary = [...body]
      .sort((a, b) => b.text.length - a.text.length)
      .slice(0, 4)
      .map((r) => cut(r.text, 70));

    const next = rows.find((r) =>
      has(r.text, ['다음 회의', '다음주 회의', '다음 주 회의', '차기']),
    );

    const result = {
      title: '주간 회의록',
      date: new Date().toLocaleDateString('ko-KR'),
      attendees,
      summary,
      topics,
      decisions,
      actionItems,
      nextMeeting: next ? cut(next.text, 50) : '미정',
    };

    setMinutes(result);
    setMeta({
      title: result.title,
      date: result.date,
      attendees: attendees.join(', '),
    });
    setBusy(null);
  };

  const savePdf = async () => {
    if (!docRef.current) return;
    setBusy('pdf');
    setNote(null);
    try {
      await loadScript(
        'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
      );
      await loadScript(
        'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
      );
      const canvas = await window.html2canvas(docRef.current, {
        scale: 2,
        backgroundColor: '#FFFFFF',
        useCORS: true,
      });
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pw = 210,
        ph = 297,
        m = 12;
      const iw = pw - m * 2;
      const ih = (canvas.height * iw) / canvas.width;
      const img = canvas.toDataURL('image/png');
      let left = ih,
        y = m;
      pdf.addImage(img, 'PNG', m, y, iw, ih);
      left -= ph - m * 2;
      while (left > 0) {
        y = left - ih + m;
        pdf.addPage();
        pdf.addImage(img, 'PNG', m, y, iw, ih);
        left -= ph - m * 2;
      }
      pdf.save(`${(meta.title || '회의록').replace(/[\\/:*?"<>|]/g, '')}.pdf`);
      setPdfDone(true);
    } catch {
      const w = window.open('', '_blank');
      if (w) {
        w.document.write(
          `<meta charset="utf-8"><title>${meta.title || '회의록'}</title><body style="margin:0;font-family:${SANS}">${docRef.current.outerHTML}</body>`,
        );
        w.document.close();
        w.print();
        setPdfDone(true);
      } else {
        setNote({
          kind: 'error',
          text: 'PDF 저장에 실패했습니다. 이 앱을 새 창에서 열고 다시 시도해 주세요.',
        });
      }
    } finally {
      setBusy(null);
    }
  };

  const reset = () => {
    stopMic();
    setTranscript('');
    setInterim('');
    setMinutes(null);
    setRawFallback('');
    setNote(null);
    setPdfDone(false);
  };

  const chars = transcript.length;

  return (
    <div
      style={{
        background: T.desk,
        minHeight: '100vh',
        fontFamily: SANS,
        color: T.ink,
      }}
    >
      <style>{`
        @keyframes stampIn {0%{opacity:0;transform:scale(1.6) rotate(-18deg)}60%{opacity:1;transform:scale(.94) rotate(-9deg)}100%{opacity:1;transform:scale(1) rotate(-11deg)}}
        @keyframes pulse {0%,100%{opacity:1}50%{opacity:.35}}
        .stamp{animation:stampIn .45s cubic-bezier(.2,1.4,.4,1) both}
        .pulse{animation:pulse 1.1s ease-in-out infinite}
        @media (prefers-reduced-motion: reduce){.stamp,.pulse{animation:none}}
        .mmb-input:focus-visible{outline:2px solid ${T.ink};outline-offset:1px}
        @media (max-width: 860px){.mmb-grid{grid-template-columns:minmax(0,1fr) !important}}
      `}</style>

      <div
        style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 20px 56px' }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            paddingBottom: 14,
            borderBottom: `1px solid ${T.rule}`,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 11,
                letterSpacing: '.18em',
                color: T.ink45,
              }}
            >
              MEETING MINUTES PIPELINE
            </div>
            <h1
              style={{
                margin: '6px 0 0',
                fontSize: 30,
                fontWeight: 800,
                letterSpacing: '-.03em',
              }}
            >
              회의록 자동화
            </h1>
          </div>
          <button onClick={reset} className='mmb-input' style={btnGhost}>
            처음부터
          </button>
        </header>

        <div
          style={{
            display: 'flex',
            gap: 0,
            margin: '18px 0 22px',
            flexWrap: 'wrap',
          }}
        >
          {stages.map((s, i) => (
            <div
              key={s.n}
              style={{ flex: '1 1 150px', minWidth: 150, paddingRight: 14 }}
            >
              <div
                style={{
                  height: 3,
                  background:
                    s.state === 'idle'
                      ? T.ruleSoft
                      : s.state === 'run'
                        ? T.seal
                        : T.ink,
                }}
                className={s.state === 'run' ? 'pulse' : ''}
              />
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 8,
                  marginTop: 8,
                }}
              >
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    color: s.state === 'idle' ? T.ink45 : T.ink,
                  }}
                >
                  {s.n}
                </span>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: s.state === 'idle' ? T.ink45 : T.ink,
                  }}
                >
                  {s.label}
                </span>
                {s.state === 'done' && (
                  <span style={{ fontFamily: MONO, fontSize: 10, color: T.ok }}>
                    완료
                  </span>
                )}
                {s.state === 'run' && (
                  <span
                    style={{ fontFamily: MONO, fontSize: 10, color: T.seal }}
                  >
                    진행중
                  </span>
                )}
              </div>
              {i === 0 && (
                <div style={{ fontSize: 12, color: T.ink45, marginTop: 2 }}>
                  녹음 · 파일 · 붙여넣기
                </div>
              )}
              {i === 1 && (
                <div style={{ fontSize: 12, color: T.ink45, marginTop: 2 }}>
                  {chars ? `${chars.toLocaleString()}자` : '대기'}
                </div>
              )}
              {i === 2 && (
                <div style={{ fontSize: 12, color: T.ink45, marginTop: 2 }}>
                  자동 정리
                </div>
              )}
              {i === 3 && (
                <div style={{ fontSize: 12, color: T.ink45, marginTop: 2 }}>
                  A4 저장
                </div>
              )}
            </div>
          ))}
        </div>

        {note && (
          <div
            style={{
              padding: '10px 14px',
              marginBottom: 16,
              fontSize: 13,
              borderLeft: `3px solid ${note.kind === 'error' ? T.seal : T.ink45}`,
              background: note.kind === 'error' ? T.sealSoft : '#F2F3F5',
              color: T.ink70,
            }}
          >
            {note.text}
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)',
            gap: 20,
          }}
          className='mmb-grid'
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <section style={panel}>
              <div
                style={{ display: 'flex', borderBottom: `1px solid ${T.rule}` }}
              >
                {[
                  ['mic', '녹음'],
                  ['file', '파일'],
                  ['text', '직접 입력'],
                ].map(([k, l]) => (
                  <button
                    key={k}
                    onClick={() => setTab(k)}
                    className='mmb-input'
                    style={{
                      ...tabBtn,
                      color: tab === k ? T.ink : T.ink45,
                      borderBottom:
                        tab === k
                          ? `2px solid ${T.seal}`
                          : '2px solid transparent',
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>

              <div style={{ padding: 18 }}>
                {tab === 'mic' && (
                  <div>
                    <p style={hint}>
                      브라우저 음성 인식으로 회의를 실시간 받아씁니다.
                      Chrome에서 가장 잘 동작합니다.
                    </p>
                    <button
                      onClick={recording ? stopMic : startMic}
                      className='mmb-input'
                      style={{
                        ...btnPrimary,
                        background: recording ? T.seal : T.ink,
                      }}
                    >
                      {recording ? '■ 녹음 멈추기' : '● 녹음 시작'}
                    </button>
                    {interim && (
                      <div
                        style={{
                          marginTop: 12,
                          fontSize: 13,
                          color: T.ink45,
                          fontStyle: 'italic',
                        }}
                      >
                        {interim}
                      </div>
                    )}
                  </div>
                )}

                {tab === 'file' && (
                  <div>
                    <p style={hint}>
                      Whisper 서버에 오디오를 보내 받아씁니다. 서버 주소를
                      넣어야 작동합니다.
                    </p>
                    <input
                      className='mmb-input'
                      style={input}
                      placeholder='http://localhost:8000/transcribe'
                      value={sttUrl}
                      onChange={(e) => setSttUrl(e.target.value)}
                    />
                    <label
                      className='mmb-input'
                      style={{
                        ...btnGhost,
                        display: 'inline-block',
                        marginTop: 12,
                        cursor: 'pointer',
                      }}
                    >
                      오디오 파일 선택
                      <input
                        type='file'
                        accept='audio/*,video/*'
                        style={{ display: 'none' }}
                        onChange={(e) => onFile(e.target.files?.[0])}
                      />
                    </label>
                    {busy === 'stt' && (
                      <span
                        style={{ marginLeft: 10, fontSize: 12, color: T.seal }}
                        className='pulse'
                      >
                        받아쓰는 중…
                      </span>
                    )}
                  </div>
                )}

                {tab === 'text' && (
                  <div>
                    <p style={hint}>
                      이미 받아쓴 텍스트가 있다면 아래 전사 칸에 바로
                      붙여넣으세요.
                    </p>
                    <button
                      onClick={() => setTranscript(SAMPLE)}
                      className='mmb-input'
                      style={btnGhost}
                    >
                      샘플 회의 불러오기
                    </button>
                  </div>
                )}
              </div>
            </section>

            <section style={panel}>
              <div style={sectionHead}>
                <span>전사 원문</span>
                <span
                  style={{ fontFamily: MONO, fontSize: 11, color: T.ink45 }}
                >
                  {chars.toLocaleString()}자
                </span>
              </div>
              <div style={{ padding: 18 }}>
                <textarea
                  className='mmb-input'
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder='받아쓴 내용이 여기에 쌓입니다. 직접 수정해도 됩니다.'
                  style={{
                    ...input,
                    minHeight: 260,
                    resize: 'vertical',
                    lineHeight: 1.7,
                    fontSize: 13.5,
                  }}
                />
                <button
                  onClick={summarize}
                  disabled={busy === 'summary'}
                  className='mmb-input'
                  style={{
                    ...btnPrimary,
                    marginTop: 14,
                    width: '100%',
                    opacity: busy === 'summary' ? 0.6 : 1,
                  }}
                >
                  {busy === 'summary' ? '요약하는 중…' : '회의록으로 정리'}
                </button>
              </div>
            </section>
          </div>

          <div>
            <section style={{ ...panel, position: 'sticky', top: 20 }}>
              <div style={sectionHead}>
                <span>회의록</span>
                {minutes && (
                  <button
                    onClick={savePdf}
                    disabled={busy === 'pdf'}
                    className='mmb-input'
                    style={btnSmall}
                  >
                    {busy === 'pdf' ? '만드는 중…' : 'PDF로 저장'}
                  </button>
                )}
              </div>
              <div
                style={{ padding: 18, maxHeight: '72vh', overflowY: 'auto' }}
              >
                {!minutes && !rawFallback && (
                  <div
                    style={{
                      padding: '60px 20px',
                      textAlign: 'center',
                      color: T.ink45,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: MONO,
                        fontSize: 11,
                        letterSpacing: '.2em',
                        marginBottom: 8,
                      }}
                    >
                      EMPTY
                    </div>
                    <div style={{ fontSize: 13.5 }}>
                      전사 내용을 넣고 정리를 누르면
                      <br />
                      여기에 회의록이 만들어집니다.
                    </div>
                  </div>
                )}
                {rawFallback && (
                  <pre
                    style={{
                      fontSize: 12,
                      whiteSpace: 'pre-wrap',
                      color: T.ink70,
                      fontFamily: MONO,
                    }}
                  >
                    {rawFallback}
                  </pre>
                )}
                {minutes && (
                  <MinutesDoc
                    ref={docRef}
                    data={minutes}
                    meta={meta}
                    setMeta={setMeta}
                  />
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

const MinutesDoc = React.forwardRef(function MinutesDoc(
  { data, meta, setMeta },
  ref,
) {
  const row = {
    display: 'flex',
    borderTop: '1px solid #D3D7DC',
    fontSize: 12.5,
  };
  const th = {
    width: 74,
    flexShrink: 0,
    padding: '8px 10px',
    background: '#F4F5F7',
    color: '#4B535E',
    fontWeight: 600,
  };
  const td = { padding: '8px 10px', color: '#171B21', flex: 1 };
  const h2 = {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '.02em',
    margin: '22px 0 8px',
    paddingBottom: 4,
    borderBottom: '1.5px solid #171B21',
  };
  const li = {
    fontSize: 13,
    lineHeight: 1.65,
    color: '#171B21',
    margin: '0 0 5px',
    paddingLeft: 13,
    position: 'relative',
  };
  const dot = { position: 'absolute', left: 0, top: 0, color: '#7C858F' };

  return (
    <div
      ref={ref}
      style={{
        background: '#FFFFFF',
        padding: '30px 28px',
        position: 'relative',
        fontFamily: SANS,
      }}
    >
      <div
        className='stamp'
        style={{
          position: 'absolute',
          top: 18,
          right: 20,
          width: 74,
          height: 74,
          borderRadius: '50%',
          border: '2.5px solid #C8352B',
          color: '#C8352B',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          transform: 'rotate(-11deg)',
          opacity: 0.9,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.02em' }}>
          회의록
        </div>
        <div style={{ fontFamily: MONO, fontSize: 8, marginTop: 2 }}>
          {meta.date || ''}
        </div>
      </div>

      <div
        style={{
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: '.18em',
          color: '#7C858F',
        }}
      >
        MINUTES
      </div>
      <input
        value={meta.title}
        onChange={(e) => setMeta({ ...meta, title: e.target.value })}
        style={{
          display: 'block',
          width: '78%',
          border: 'none',
          padding: 0,
          margin: '6px 0 16px',
          fontSize: 21,
          fontWeight: 800,
          letterSpacing: '-.02em',
          color: '#171B21',
          background: 'transparent',
          fontFamily: SANS,
        }}
      />

      <div style={{ borderBottom: '1px solid #D3D7DC' }}>
        <div style={row}>
          <div style={th}>일시</div>
          <div style={td}>{meta.date || '미정'}</div>
        </div>
        <div style={row}>
          <div style={th}>참석</div>
          <div style={td}>{meta.attendees || '미정'}</div>
        </div>
        {data.nextMeeting && (
          <div style={row}>
            <div style={th}>차기</div>
            <div style={td}>{data.nextMeeting}</div>
          </div>
        )}
      </div>

      {!!(data.summary || []).length && (
        <>
          <div style={h2}>핵심 요약</div>
          {data.summary.map((s, i) => (
            <p key={i} style={li}>
              <span style={dot}>·</span>
              {s}
            </p>
          ))}
        </>
      )}

      {!!(data.topics || []).length && (
        <>
          <div style={h2}>논의 내용</div>
          {data.topics.map((t, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    color: '#7C858F',
                    marginRight: 6,
                  }}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                {t.heading}
              </div>
              {(t.points || []).map((p, j) => (
                <p key={j} style={li}>
                  <span style={dot}>·</span>
                  {p}
                </p>
              ))}
            </div>
          ))}
        </>
      )}

      {!!(data.decisions || []).length && (
        <>
          <div style={h2}>결정 사항</div>
          {data.decisions.map((d, i) => (
            <p key={i} style={{ ...li, paddingLeft: 16 }}>
              <span style={{ ...dot, color: '#C8352B', fontWeight: 700 }}>
                ✓
              </span>
              {d}
            </p>
          ))}
        </>
      )}

      {!!(data.actionItems || []).length && (
        <>
          <div style={h2}>실행 항목</div>
          <div style={{ border: '1px solid #D3D7DC' }}>
            <div
              style={{
                display: 'flex',
                background: '#F4F5F7',
                fontSize: 11,
                fontWeight: 700,
                color: '#4B535E',
              }}
            >
              <div style={{ width: 72, padding: '6px 10px' }}>담당</div>
              <div style={{ flex: 1, padding: '6px 10px' }}>할 일</div>
              <div style={{ width: 88, padding: '6px 10px' }}>기한</div>
            </div>
            {data.actionItems.map((a, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  fontSize: 12.5,
                  borderTop: '1px solid #E7E9EC',
                }}
              >
                <div
                  style={{ width: 72, padding: '8px 10px', fontWeight: 600 }}
                >
                  {a.owner || '미정'}
                </div>
                <div style={{ flex: 1, padding: '8px 10px', lineHeight: 1.5 }}>
                  {a.task}
                </div>
                <div
                  style={{
                    width: 88,
                    padding: '8px 10px',
                    fontFamily: MONO,
                    fontSize: 11,
                    color: '#4B535E',
                  }}
                >
                  {a.due || '미정'}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div
        style={{
          marginTop: 26,
          paddingTop: 10,
          borderTop: '1px solid #E7E9EC',
          fontFamily: MONO,
          fontSize: 9.5,
          color: '#7C858F',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>AUTO-GENERATED FROM AUDIO TRANSCRIPT</span>
        <span>내용은 검토 후 확정하세요</span>
      </div>
    </div>
  );
});

const panel = { background: T.panel, border: `1px solid ${T.rule}` };
const sectionHead = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 18px',
  borderBottom: `1px solid ${T.rule}`,
  fontSize: 13,
  fontWeight: 700,
};
const tabBtn = {
  flex: 1,
  padding: '12px 8px',
  background: 'transparent',
  border: 'none',
  fontSize: 13.5,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: SANS,
};
const hint = {
  fontSize: 13,
  color: T.ink70,
  margin: '0 0 12px',
  lineHeight: 1.6,
};
const input = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '9px 11px',
  border: `1px solid ${T.rule}`,
  background: '#FCFCFD',
  fontSize: 13,
  color: T.ink,
  fontFamily: SANS,
};
const btnPrimary = {
  padding: '11px 18px',
  background: T.ink,
  color: '#FFF',
  border: 'none',
  fontSize: 13.5,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: SANS,
};
const btnGhost = {
  padding: '9px 14px',
  background: 'transparent',
  color: T.ink,
  border: `1px solid ${T.rule}`,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: SANS,
};
const btnSmall = {
  padding: '6px 12px',
  background: T.seal,
  color: '#FFF',
  border: 'none',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: SANS,
};
