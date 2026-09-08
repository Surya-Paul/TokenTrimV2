import React from 'react';

export interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
}

export function Toggle({ label, checked, onChange, disabled, id }: ToggleProps) {
  const toggleId = id || label.toLowerCase().replace(/\s+/g, '-');
  
  return (
    <label className="toggle-wrapper">
      <input
        type="checkbox"
        id={toggleId}
        className="toggle-input"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span className="toggle">
        <span className="toggle-track">
          <span className="toggle-thumb" />
        </span>
      </span>
      <span className="toggle-label">{label}</span>
    </label>
  );
}