import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useLanguage } from "../features/language/LanguageProvider";

interface Props {
  title?: string;
  subtitle?: string;
  value: string;
  onChange: (dataUrl: string) => void;
}

function getPoint(e: PointerEvent<HTMLCanvasElement>, c: HTMLCanvasElement) {
  const r = c.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

export function SignaturePad({ title = "Signatur", subtitle, value, onChange }: Props) {
  const { locale, messages } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [hasStroke, setHasStroke] = useState(Boolean(value));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#1e40af";
    ctxRef.current = ctx;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !value) return;
    const ctx = ctxRef.current ?? canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); };
    img.src = value;
  }, [value]);

  const commit = () => {
    const c = canvasRef.current;
    if (!c) return;
    setHasStroke(true);
    onChange(c.toDataURL("image/png"));
  };

  const start = (e: PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current; const ctx = ctxRef.current;
    if (!c || !ctx) return;
    c.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastRef.current = getPoint(e, c);
  };

  const draw = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const c = canvasRef.current; const ctx = ctxRef.current;
    if (!c || !ctx || !lastRef.current) return;
    const p = getPoint(e, c);
    ctx.beginPath(); ctx.moveTo(lastRef.current.x, lastRef.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    lastRef.current = p;
  };

  const end = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false; lastRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    commit();
  };

  const clear = () => {
    const c = canvasRef.current; const ctx = ctxRef.current;
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    setHasStroke(false); onChange("");
  };

  return (
    <div className="sig-card">
      <div className="sig-card-header">
        <div>
          <span className="eyebrow">{title === "Signatur" ? messages.common.signature.defaultTitle : title}</span>
          {subtitle && <p className="text-muted text-xs">{subtitle}</p>}
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={clear}>{messages.common.actions.clear}</button>
      </div>
      <canvas
        ref={canvasRef}
        className="sig-canvas"
        width={480}
        height={140}
        onPointerDown={start}
        onPointerMove={draw}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <span className="text-xs text-muted">{hasStroke ? messages.common.signature.captured : messages.common.signature.hint}</span>
    </div>
  );
}
