"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { XMarkIcon } from "@heroicons/react/24/solid";
// @ts-expect-error jsqr has no types
import jsQR from "jsqr";

interface QRCheckInScannerProps {
  open: boolean;
  onClose: () => void;
  sessionToken: string | null;
  onLookup: (result: { signup: SignupOrComp; isComp: boolean }) => void;
}

interface SignupOrComp {
  id: string;
  event_id: string;
  event_title?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  payment_method?: string;
  paid?: boolean;
  checked_in?: boolean;
  amount_owed?: number;
  strictly_selected?: boolean;
  strictly_lead_first_name?: string | null;
  strictly_lead_last_name?: string | null;
  strictly_follow_first_name?: string | null;
  strictly_follow_last_name?: string | null;
  jnj_selected?: boolean;
  jnj_lead_first_name?: string | null;
  jnj_lead_last_name?: string | null;
  [key: string]: unknown;
}

export default function QRCheckInScanner({ open, onClose, sessionToken, onLookup }: QRCheckInScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const lastTokenRef = useRef<string | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      stopCamera();
      setError(null);
      setLookupError(null);
      lastTokenRef.current = null;
      return;
    }
    setScanning(true);
    setError(null);
    let cancelled = false;
    const video = videoRef.current;
    if (!video) return;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        video.srcObject = stream;
        video.play().catch((e) => {
          setError("Could not start camera");
          console.warn(e);
        });
      })
      .catch(() => {
        if (!cancelled) setError("Camera access denied or unavailable");
      });
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, stopCamera]);

  useEffect(() => {
    if (!open || !videoRef.current || !canvasRef.current || !sessionToken) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId: number;
    function tick() {
      if (!video.srcObject || video.readyState !== video.HAVE_ENOUGH_DATA) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code?.data) {
        const token = code.data.trim();
        if (token && token !== lastTokenRef.current) {
          lastTokenRef.current = token;
          setScanning(false);
          fetch(`/api/signups/lookup?token=${encodeURIComponent(token)}`, {
            headers: { Authorization: `Bearer ${sessionToken}` },
          })
            .then(async (res) => {
              const data = await res.json();
              if (!res.ok) {
                setLookupError(res.status === 404 ? "Registration not found" : (data.error || "Lookup failed"));
                lastTokenRef.current = null;
                setScanning(true);
                return;
              }
              if (data.error) {
                setLookupError(data.error || "Lookup failed");
                lastTokenRef.current = null;
                setScanning(true);
                return;
              }
              onLookup({ signup: data.signup, isComp: data.isComp === true });
              onClose();
            })
            .catch(() => {
              setLookupError("Network error");
              lastTokenRef.current = null;
              setScanning(true);
            });
          return;
        }
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [open, sessionToken, onLookup, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="relative w-full max-w-md rounded-xl bg-neutral-900 border border-neutral-700 shadow-xl overflow-hidden">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-2 rounded-full bg-neutral-800 hover:bg-neutral-700 text-white"
          aria-label="Close"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
        <div className="p-4 text-center">
          <h3 className="text-lg font-semibold text-white mb-1">Scan QR code</h3>
          <p className="text-sm text-gray-400">Point the camera at the attendee&apos;s confirmation QR code.</p>
        </div>
        <div className="relative aspect-square bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-neutral-900 text-gray-400 text-sm p-4">
              {error}
            </div>
          )}
          {lookupError && (
            <div className="absolute bottom-2 left-2 right-2 py-2 px-3 rounded bg-red-900/80 text-red-200 text-sm">
              {lookupError}
            </div>
          )}
        </div>
        <div className="p-3 text-center text-gray-500 text-xs">
          {scanning ? "Scanning…" : "Looking up…"}
        </div>
      </div>
    </div>
  );
}
