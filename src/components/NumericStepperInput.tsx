import React, { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

interface NumericStepperInputProps {
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}

export const NumericStepperInput: React.FC<NumericStepperInputProps> = ({
  value,
  onChange,
  min = 0,
  max = 1000,
  step = 1,
  className,
}) => {
  const [localValue, setLocalValue] = useState<string>(() => value.toString());

  // Sync with outer value changes when not focused
  useEffect(() => {
    setLocalValue(prev => {
      const parsed = parseFloat(prev);
      if (isNaN(parsed) || parsed !== value) {
        return value.toString();
      }
      return prev;
    });
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setLocalValue(raw);

    // Parse and validate quietly
    const parsed = parseFloat(raw);
    if (!isNaN(parsed) && parsed >= min && parsed <= max) {
      onChange(parsed);
    }
  };

  const handleBlur = () => {
    const parsed = parseFloat(localValue);
    if (isNaN(parsed) || parsed < min) {
      const fallback = min;
      setLocalValue(fallback.toString());
      onChange(fallback);
    } else if (parsed > max) {
      const fallback = max;
      setLocalValue(fallback.toString());
      onChange(fallback);
    } else {
      setLocalValue(parsed.toString());
      onChange(parsed);
    }
  };

  const handleIncrement = () => {
    const current = parseFloat(localValue) || 0;
    const next = Math.min(max, parseFloat((current + step).toFixed(2)));
    setLocalValue(next.toString());
    onChange(next);
  };

  const handleDecrement = () => {
    const current = parseFloat(localValue) || 0;
    const next = Math.max(min, parseFloat((current - step).toFixed(2)));
    setLocalValue(next.toString());
    onChange(next);
  };

  return (
    <div className={`flex items-center bg-[#0a0d11] border border-[#2a3038] rounded-lg overflow-hidden h-9 focus-within:border-[#16c784]/50 transition-all ${className}`}>
      <button
        type="button"
        onClick={handleDecrement}
        className="w-8 h-full flex items-center justify-center hover:bg-white/5 text-slate-400 hover:text-white transition-colors border-r border-[#2a3038] active:scale-95 shrink-0"
      >
        <Minus className="w-3 h-3" />
      </button>
      
      <input
        type="text"
        inputMode="decimal"
        value={localValue}
        onChange={handleInputChange}
        onBlur={handleBlur}
        className="flex-1 min-w-0 bg-transparent text-white text-xs font-black outline-none border-none text-center h-full px-1"
      />
      
      <button
        type="button"
        onClick={handleIncrement}
        className="w-8 h-full flex items-center justify-center hover:bg-white/5 text-slate-400 hover:text-white transition-colors border-l border-[#2a3038] active:scale-95 shrink-0"
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );
};

export default NumericStepperInput;
