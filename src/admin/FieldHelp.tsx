import { useId, useState, useLayoutEffect, useRef } from "react";

export function FieldHelp({ label, text }: { label: string; text: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState({ left: 12, top: 12 });
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(300, window.innerWidth - 24),
        height = tooltip.current?.offsetHeight || 0;
      setPosition({
        left: Math.max(
          12,
          Math.min(
            rect.left + rect.width / 2 - width / 2,
            window.innerWidth - width - 12,
          ),
        ),
        top:
          rect.bottom + height + 16 > window.innerHeight
            ? Math.max(12, rect.top - height - 4)
            : rect.bottom + 4,
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);
  return (
    <span
      className="admin-field-help"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        ref={anchor}
        type="button"
        className="admin-field-help-button"
        aria-label={`Ajuda sobre ${label}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            setOpen(false);
          }
        }}
      >
        <span aria-hidden="true">?</span>
      </button>
      {open && (
        <span
          ref={tooltip}
          style={position}
          className="admin-field-help-popover"
          id={id}
          role="tooltip"
        >
          {text}
        </span>
      )}
    </span>
  );
}
