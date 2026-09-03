import React, { useEffect } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

interface ToastProps {
  message: string;
  isError?: boolean;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, isError = false, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 4200);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-none border-l-4 text-xs font-semibold shadow-md animate-in slide-in-from-bottom-5 duration-150 ${
        isError
          ? 'bg-[#fff0f1] text-[#da1e28] border-l-[#da1e28] border-t border-r border-b border-[#ffd7d9]'
          : 'bg-[#defbe6] text-[#198038] border-l-[#24a148] border-t border-r border-b border-[#b9f5d0]'
      }`}
      role="alert"
    >
      {isError ? (
        <AlertCircle className="w-4 h-4 text-[#da1e28] shrink-0" />
      ) : (
        <CheckCircle2 className="w-4 h-4 text-[#24a148] shrink-0" />
      )}
      <span className="max-w-xs sm:max-w-md leading-tight">{message}</span>
      <button
        onClick={onClose}
        className="p-1 text-[#525252] hover:text-[#161616] rounded-none transition-colors ml-2"
        aria-label="Dismiss toast"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
