import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';

const ToastContext = createContext<(message: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((next: string) => {
    setMessage(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 2400);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-6 z-[9999] flex justify-center px-4"
      >
        {message && (
          <div className="animate-in fade-in slide-in-from-bottom-2 flex items-center gap-2 rounded-full border border-white/10 bg-[#0a0e17]/90 py-2 pl-2.5 pr-4 text-[12px] text-white shadow-[0_8px_40px_-8px_rgba(94,231,255,0.5)] backdrop-blur-xl">
            <span className="flex size-4 items-center justify-center rounded-full bg-cyan-glow text-[#06101c]">
              <Check className="size-3" strokeWidth={3} />
            </span>
            {message}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
