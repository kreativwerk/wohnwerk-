"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Unterschriftenfeld fuer den Mieter.
 *
 * Zeichnet auf ein Canvas und legt das Ergebnis als PNG-Data-URL in ein
 * verstecktes Feld, das mit dem Formular abgeschickt wird. Funktioniert mit
 * Maus, Finger und Stift ueber Pointer Events.
 */
export function SignaturePad({
  name = "signature",
  required = true,
}: {
  name?: string;
  required?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [hasSignature, setHasSignature] = useState(false);
  const [value, setValue] = useState("");

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;

    // Vorhandene Zeichnung beim Neuaufbau erhalten
    const previous = hasSignature ? canvas.toDataURL("image/png") : null;

    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";

    if (previous) {
      const image = new Image();
      image.onload = () => ctx.drawImage(image, 0, 0, rect.width, rect.height);
      image.src = previous;
    }
  }, [hasSignature]);

  useEffect(() => {
    setupCanvas();
    window.addEventListener("resize", setupCanvas);
    return () => window.removeEventListener("resize", setupCanvas);
    // Bewusst nur beim Mounten und bei Groessenaenderung.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pointFrom(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(event.pointerId);
    drawing.current = true;
    lastPoint.current = pointFrom(event);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    event.preventDefault();

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !lastPoint.current) return;

    const point = pointFrom(event);
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPoint.current = point;

    if (!hasSignature) setHasSignature(true);
  }

  function end(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;
    lastPoint.current = null;

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.releasePointerCapture?.(event.pointerId);
      setValue(canvas.toDataURL("image/png"));
    }
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    setValue("");
  }

  return (
    <div>
      <div className="relative">
        <canvas
          ref={canvasRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
          className="h-40 w-full cursor-crosshair touch-none rounded-lg border border-dashed border-ink-300 bg-white"
          aria-label="Unterschriftenfeld"
        />
        {!hasSignature && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-ink-400">
            Hier mit Maus oder Finger unterschreiben
          </p>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs text-ink-500">
          {hasSignature ? "Unterschrift erfasst." : "Noch keine Unterschrift."}
        </p>
        <button type="button" className="btn btn-ghost" onClick={clear}>
          Löschen
        </button>
      </div>

      <input type="hidden" name={name} value={value} required={required} />
    </div>
  );
}
