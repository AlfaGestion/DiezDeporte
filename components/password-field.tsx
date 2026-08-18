"use client";

import { useState } from "react";
import { PasswordVisibilityIcon } from "@/components/password-visibility-icon";

type PasswordFieldProps = {
  label: string;
  name: string;
  required?: boolean;
  minLength?: number;
  pattern?: string;
  title?: string;
  autoComplete?: string;
};

export function PasswordField({
  label,
  name,
  required,
  minLength,
  pattern,
  title,
  autoComplete,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <label className="field">
      <span>{label}</span>
      <div className="password-field-control">
        <input
          name={name}
          type={visible ? "text" : "password"}
          required={required}
          minLength={minLength}
          pattern={pattern}
          title={title}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Ocultar clave" : "Mostrar clave"}
          aria-pressed={visible}
          title={visible ? "Ocultar clave" : "Mostrar clave"}
        >
          <PasswordVisibilityIcon visible={visible} />
        </button>
      </div>
    </label>
  );
}
