import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface CarbonSelectOption {
  value: string;
  label: string;
}

interface CarbonSelectProps {
  label?: string;
  options: CarbonSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const CarbonSelect: React.FC<CarbonSelectProps> = ({
  label,
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  required = false,
  error,
  disabled = false,
  className = '',
  size = 'md',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const sizePadding = {
    sm: 'py-1.5 px-3 text-xs',
    md: 'py-2 px-3.5 text-sm',
    lg: 'py-2.5 px-4 text-base',
  }[size];

  return (
    <div className={`relative w-full ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#525252] mb-1">
          {label} {required && <span className="text-[#da1e28]">*</span>}
        </label>
      )}

      {/* Select Trigger Box */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between cursor-pointer bg-[#f4f4f4] hover:bg-[#e8e8e8] transition-colors border-b-2 ${sizePadding} ${
          error ? 'border-[#da1e28] bg-[#fff0f1]' : isOpen ? 'border-[#0f62fe] bg-[#ffffff]' : 'border-[#8d8d8d]'
        } ${disabled ? 'opacity-50 cursor-not-allowed bg-[#e0e0e0]' : ''}`}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!disabled) setIsOpen(!isOpen);
          }
          if (e.key === 'Escape') setIsOpen(false);
        }}
        role="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={`truncate font-sans font-medium ${selectedOption ? 'text-[#161616]' : 'text-[#8d8d8d]'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-[#525252] shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-[#0f62fe]' : ''
          }`}
        />
      </div>

      {/* Error Message */}
      {error && <span className="text-[11px] text-[#da1e28] font-semibold mt-1 block">{error}</span>}

      {/* Options Dropdown Menu */}
      {isOpen && (
        <div
          className="absolute z-50 left-0 right-0 mt-0.5 bg-[#ffffff] border border-[#e0e0e0] shadow-md max-h-60 overflow-y-auto animate-in fade-in duration-100"
          role="listbox"
        >
          {options.length === 0 ? (
            <div className="p-3 text-xs text-[#8d8d8d] italic">No options available</div>
          ) : (
            options.map((opt) => {
              const isSelected = opt.value === value;

              return (
                <div
                  key={opt.value}
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  className={`flex items-center justify-between px-3.5 py-2.5 text-xs sm:text-sm font-medium cursor-pointer transition-colors border-l-4 ${
                    isSelected
                      ? 'border-[#0f62fe] bg-[#edf5ff] text-[#0f62fe] font-semibold'
                      : 'border-transparent text-[#161616] hover:bg-[#e5e5e5]'
                  }`}
                  role="option"
                  aria-selected={isSelected}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && <Check className="w-4 h-4 text-[#0f62fe] shrink-0" />}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
