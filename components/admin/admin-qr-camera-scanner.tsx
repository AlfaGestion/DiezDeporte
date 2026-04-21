"use client";

import { useEffect, useRef, useState } from "react";
import {
  adminCardClass,
  adminSecondaryButtonClass,
  cn,
} from "@/components/admin/admin-ui";

type ScannerInstance = {
  start(): Promise<void>;
  stop(): void;
  destroy(): void;
};

function buildScannerErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "No se pudo acceder a la camara.";
  }

  if (error.name === "NotAllowedError") {
    return "La camara fue bloqueada. Habilita el permiso del navegador e intenta de nuevo.";
  }

  if (error.name === "NotFoundError") {
    return "No se encontro una camara disponible en este dispositivo.";
  }

  if (error.name === "NotReadableError") {
    return "La camara esta siendo usada por otra aplicacion o pestaña.";
  }

  if (error.message) {
    return error.message;
  }

  return "No se pudo acceder a la camara.";
}

export function AdminQrCameraScanner({
  onDetected,
  buttonLabel = "Usar camara",
  className,
  disabled = false,
}: {
  onDetected: (value: string) => void;
  buttonLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scannerRef = useRef<ScannerInstance | null>(null);
  const [supportState, setSupportState] = useState<"checking" | "supported" | "unsupported">(
    "checking",
  );
  const [isOpen, setIsOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isScanningImage, setIsScanningImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requiresSecureContext, setRequiresSecureContext] = useState(false);
  const isSupported = supportState === "supported";

  const destroyScanner = () => {
    if (!scannerRef.current) {
      return;
    }

    scannerRef.current.destroy();
    scannerRef.current = null;
  };

  const closeScanner = (keepError = false) => {
    setIsOpen(false);
    setIsStarting(false);
    destroyScanner();

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (!keepError) {
      setError(null);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadSupport = async () => {
      if (typeof window === "undefined" || typeof navigator === "undefined") {
        setSupportState("unsupported");
        return;
      }

      if (!window.isSecureContext) {
        setRequiresSecureContext(true);
        setSupportState("unsupported");
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setSupportState("unsupported");
        return;
      }

      try {
        const { default: QrScanner } = await import("qr-scanner");
        const hasCamera = await QrScanner.hasCamera();

        if (!cancelled) {
          setSupportState(hasCamera ? "supported" : "unsupported");
        }
      } catch {
        if (!cancelled) {
          setSupportState("unsupported");
        }
      }
    };

    void loadSupport();

    return () => {
      cancelled = true;
      destroyScanner();
    };
  }, []);

  useEffect(() => {
    if (!isOpen || !videoRef.current) {
      return;
    }

    let cancelled = false;

    const startScanner = async () => {
      setIsStarting(true);

      try {
        const { default: QrScanner } = await import("qr-scanner");

        const scanner = new QrScanner(
          videoRef.current as HTMLVideoElement,
          (result) => {
            const nextValue =
              typeof result === "string" ? result : result.data;

            if (!nextValue?.trim()) {
              return;
            }

            closeScanner();
            onDetected(nextValue.trim());
          },
          {
            preferredCamera: "environment",
            maxScansPerSecond: 12,
            returnDetailedScanResult: true,
            onDecodeError: () => {},
          },
        );

        scannerRef.current = scanner as ScannerInstance;
        await scanner.start();
      } catch (scanError) {
        if (!cancelled) {
          setError(buildScannerErrorMessage(scanError));
          closeScanner(true);
        }
      } finally {
        if (!cancelled) {
          setIsStarting(false);
        }
      }
    };

    void startScanner();

    return () => {
      cancelled = true;
      destroyScanner();
    };
  }, [isOpen, onDetected]);

  const handleScanImage = async (file: File | null) => {
    if (!file) {
      return;
    }

    setError(null);
    setIsScanningImage(true);

    try {
      const { default: QrScanner } = await import("qr-scanner");
      const result = await QrScanner.scanImage(file, {
        returnDetailedScanResult: true,
      });
      const nextValue =
        typeof result === "string" ? result : result.data;

      if (!nextValue?.trim()) {
        throw new Error("No se encontro un QR valido en la imagen.");
      }

      onDetected(nextValue.trim());
    } catch (scanError) {
      setError(
        scanError instanceof Error
          ? scanError.message || "No se pudo leer el QR de la imagen."
          : "No se pudo leer el QR de la imagen.",
      );
    } finally {
      setIsScanningImage(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={isOpen ? () => closeScanner() : () => {
          if (disabled || !isSupported || isOpen) {
            return;
          }

          setError(null);
          setIsOpen(true);
        }}
        disabled={disabled || (!isOpen && supportState === "unsupported")}
        className={cn(
          adminSecondaryButtonClass,
          "w-full",
          disabled && "cursor-not-allowed opacity-60",
          className,
        )}
      >
        {isOpen ? "Cerrar camara" : isStarting ? "Abriendo camara..." : buttonLabel}
      </button>

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled || isScanningImage}
        className={cn(
          adminSecondaryButtonClass,
          "w-full",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        {isScanningImage ? "Leyendo imagen..." : "Sacar o subir foto del QR"}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const nextFile = event.target.files?.[0] || null;
          void handleScanImage(nextFile);
        }}
      />

      {requiresSecureContext ? (
        <p className="text-xs text-[color:var(--admin-text)]">
          En celular, la camara en vivo requiere `https`. En esta URL `http` no se va a abrir.
          Puedes usar la opcion de foto del QR o entrar por `https`.
        </p>
      ) : supportState === "unsupported" ? (
        <p className="text-xs text-[color:var(--admin-text)]">
          La lectura por camara no esta disponible en este navegador o dispositivo.
        </p>
      ) : null}

      {isOpen ? (
        <div className={cn(adminCardClass, "space-y-3 p-3")}>
          <div className="overflow-hidden rounded-[14px] bg-slate-950">
            <video
              ref={videoRef}
              muted
              playsInline
              className="aspect-video w-full object-cover"
            />
          </div>
          <p className="text-xs text-[color:var(--admin-text)]">
            Apunta la camara al QR del retiro. Cuando lo detecte, el codigo se completa solo.
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-[14px] border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200">
          {error}
        </div>
      ) : null}
    </div>
  );
}
