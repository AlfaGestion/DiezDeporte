type PasswordVisibilityIconProps = {
  visible: boolean;
};

export function PasswordVisibilityIcon({ visible }: PasswordVisibilityIconProps) {
  return visible ? <EyeOffIcon /> : <EyeIcon />;
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 12S5.5 5.5 12 5.5 21.75 12 21.75 12 18.5 18.5 12 18.5 2.25 12 2.25 12Z"
      />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 12S5.5 5.5 12 5.5c2.06 0 3.77.63 5.15 1.5M21.75 12S18.5 18.5 12 18.5c-2.06 0-3.77-.63-5.15-1.5"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.9 9.9a3 3 0 0 0 4.2 4.2"
      />
      <path strokeLinecap="round" d="M3.5 3.5l17 17" />
    </svg>
  );
}
