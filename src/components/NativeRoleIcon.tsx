export function NativeRoleIcon({ role }: { role: "anchor" | "admin" }) {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    {role === "anchor" ? <g transform="rotate(35 12 12)">
      <path fillRule="evenodd" d="M12 1a6.5 6.5 0 0 0-4.7 11 7.2 7.2 0 0 0 9.4 0A6.5 6.5 0 0 0 12 1ZM8.5 4.5V6h7V4.5ZM7.5 8v1.5h9V8Z" />
      <path d="M8 13h8v2H8Zm2 3h4v5a2 2 0 0 1-4 0Z" />
    </g> : <path fillRule="evenodd" d="M12 2 21 5.8V12c0 4.4-3.6 7.7-9 10-5.4-2.3-9-5.6-9-10V5.8Zm-3.7 9.2-1.7 1.7 4 4 7-7-1.7-1.7-5.3 5.3Z" />}
  </svg>;
}
