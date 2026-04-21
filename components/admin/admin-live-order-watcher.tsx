"use client";

import { startTransition, useEffect, useEffectEvent, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/components/admin/admin-ui";
import type { AdminOrderWatchSnapshot } from "@/lib/types";

type AdminLiveOrderWatcherProps = {
  initialSnapshot: AdminOrderWatchSnapshot;
  ordersHref: string;
  refreshOnNewOrders?: boolean;
  pollIntervalMs?: number;
};

type WatchApiResponse =
  | AdminOrderWatchSnapshot
  | {
      error?: string;
    };

type ToastState = {
  count: number;
  latestOrderNumber: string | null;
  latestCustomerName: string | null;
};

function buildToastMessage(toast: ToastState) {
  if (toast.count > 1) {
    return `${toast.count} pedidos nuevos en el panel.`;
  }

  return "Llego un pedido nuevo.";
}

function isWatchSnapshot(value: WatchApiResponse | null): value is AdminOrderWatchSnapshot {
  return Boolean(
    value &&
      typeof value === "object" &&
      "totalOrders" in value &&
      "latestOrderId" in value,
  );
}

export function AdminLiveOrderWatcher({
  initialSnapshot,
  ordersHref,
  refreshOnNewOrders = true,
  pollIntervalMs = 6000,
}: AdminLiveOrderWatcherProps) {
  const router = useRouter();
  const latestOrderIdRef = useRef(initialSnapshot.latestOrderId || 0);
  const totalOrdersRef = useRef(initialSnapshot.totalOrders);
  const audioContextRef = useRef<AudioContext | null>(null);
  const hideToastTimeoutRef = useRef<number | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    latestOrderIdRef.current = Math.max(
      latestOrderIdRef.current,
      initialSnapshot.latestOrderId || 0,
    );
    totalOrdersRef.current = Math.max(totalOrdersRef.current, initialSnapshot.totalOrders);
  }, [initialSnapshot.latestOrderId, initialSnapshot.totalOrders]);

  useEffect(() => {
    return () => {
      if (hideToastTimeoutRef.current) {
        window.clearTimeout(hideToastTimeoutRef.current);
      }
    };
  }, []);

  const dismissToastLater = useEffectEvent(() => {
    if (hideToastTimeoutRef.current) {
      window.clearTimeout(hideToastTimeoutRef.current);
    }

    hideToastTimeoutRef.current = window.setTimeout(() => {
      setToast(null);
      hideToastTimeoutRef.current = null;
    }, 9000);
  });

  const playNotificationSound = useEffectEvent(async () => {
    if (typeof window === "undefined" || typeof window.AudioContext === "undefined") {
      return;
    }

    try {
      audioContextRef.current ??= new window.AudioContext();
      const context = audioContextRef.current;

      if (context.state === "suspended") {
        await context.resume();
      }

      const now = context.currentTime;
      const tones = [
        { frequency: 880, start: now, duration: 0.12 },
        { frequency: 1320, start: now + 0.16, duration: 0.14 },
      ];

      for (const tone of tones) {
        const oscillator = context.createOscillator();
        const gainNode = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = tone.frequency;
        gainNode.gain.setValueAtTime(0.0001, tone.start);
        gainNode.gain.exponentialRampToValueAtTime(0.12, tone.start + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, tone.start + tone.duration);
        oscillator.connect(gainNode);
        gainNode.connect(context.destination);
        oscillator.start(tone.start);
        oscillator.stop(tone.start + tone.duration);
      }
    } catch {
      // Ignore browser autoplay restrictions or missing audio capabilities.
    }
  });

  const showDesktopNotification = useEffectEvent((nextSnapshot: AdminOrderWatchSnapshot) => {
    if (
      typeof window === "undefined" ||
      typeof Notification === "undefined" ||
      Notification.permission !== "granted" ||
      document.visibilityState !== "hidden"
    ) {
      return;
    }

    const orderNumber = nextSnapshot.latestOrderNumber || "Sin numero";
    const customerName = nextSnapshot.latestCustomerName || "Cliente sin nombre";
    new Notification("Nuevo pedido recibido", {
      body: `${orderNumber} • ${customerName}`,
      tag: `admin-order-${nextSnapshot.latestOrderId || "latest"}`,
    });
  });

  const handleNewOrders = useEffectEvent((nextSnapshot: AdminOrderWatchSnapshot) => {
    const previousTotal = totalOrdersRef.current;
    const nextTotal = nextSnapshot.totalOrders;
    const nextOrderId = nextSnapshot.latestOrderId || 0;
    const newOrdersCount =
      nextTotal > previousTotal ? nextTotal - previousTotal : 1;

    latestOrderIdRef.current = nextOrderId;
    totalOrdersRef.current = nextTotal;
    setToast({
      count: newOrdersCount,
      latestOrderNumber: nextSnapshot.latestOrderNumber,
      latestCustomerName: nextSnapshot.latestCustomerName,
    });
    dismissToastLater();
    void playNotificationSound();
    showDesktopNotification(nextSnapshot);
    if (refreshOnNewOrders) {
      startTransition(() => {
        router.refresh();
      });
    }
  });

  const pollSnapshot = useEffectEvent(async () => {
    const response = await fetch("/api/admin/orders/watch", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    const result = (await response.json().catch(() => null)) as WatchApiResponse | null;

    if (!response.ok || !isWatchSnapshot(result)) {
      return;
    }

    const nextOrderId = result.latestOrderId || 0;

    if (nextOrderId > latestOrderIdRef.current) {
      handleNewOrders(result);
      return;
    }

    latestOrderIdRef.current = Math.max(latestOrderIdRef.current, nextOrderId);
    totalOrdersRef.current = Math.max(totalOrdersRef.current, result.totalOrders);
  });

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void pollSnapshot();
      }
    };

    const intervalId = window.setInterval(() => {
      void pollSnapshot();
    }, Math.max(3000, pollIntervalMs));

    window.addEventListener("focus", handleVisibilityChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleVisibilityChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [pollIntervalMs, pollSnapshot]);

  if (!toast) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] w-full max-w-sm px-4 sm:px-0">
      <div
        className={cn(
          "pointer-events-auto rounded-[20px] border border-emerald-200 bg-emerald-50/95 p-4 shadow-[0_20px_40px_rgba(6,95,70,0.18)] backdrop-blur",
          "dark:border-emerald-400/20 dark:bg-emerald-500/12 dark:shadow-[0_20px_40px_rgba(0,0,0,0.28)]",
        )}
      >
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-200">
          Alerta de pedidos
        </div>
        <div className="mt-2 text-sm font-semibold text-emerald-900 dark:text-emerald-100">
          {buildToastMessage(toast)}
        </div>
        <div className="mt-1 text-sm text-emerald-800 dark:text-emerald-200/90">
          {toast.latestOrderNumber || "Pedido sin numero"}
          {toast.latestCustomerName ? ` • ${toast.latestCustomerName}` : ""}
        </div>
        {!refreshOnNewOrders ? (
          <div className="mt-3">
            <Link
              href={ordersHref}
              className="inline-flex items-center justify-center rounded-[12px] bg-emerald-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
            >
              Abrir pedidos
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
