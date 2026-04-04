import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconCheck } from "./Icons";

export interface UiSelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface Props {
  id?: string;
  value: string;
  options: UiSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  title?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
}

export function UiSelect({
  id,
  value,
  options,
  onChange,
  placeholder,
  disabled = false,
  className,
  ariaLabel,
  title,
  searchable = false,
  searchPlaceholder
}: Props) {
  const generatedId = useId();
  const triggerId = id ?? `ui-select-${generatedId}`;
  const listboxId = `${triggerId}-listbox`;
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const triggerInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [openUpwards, setOpenUpwards] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [menuGeometry, setMenuGeometry] = useState<{ left: number; top?: number; bottom?: number; width: number; maxHeight: number } | null>(null);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value]
  );
  const visibleOptions = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) {
      return options;
    }

    return options.filter((option) => [option.label, option.description ?? ""]
      .some((candidate) => candidate.toLowerCase().includes(needle)));
  }, [options, searchQuery]);

  function getTriggerElement(): HTMLButtonElement | HTMLInputElement | null {
    return triggerInputRef.current ?? triggerButtonRef.current;
  }

  useEffect(() => {
    if (!open) {
      setSearchQuery("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function updatePosition(): void {
      const trigger = getTriggerElement();
      if (!trigger) {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom - 16;
      const spaceAbove = rect.top - 16;
      const openUpwards = spaceBelow < 220 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(Math.min(openUpwards ? spaceAbove : spaceBelow, 320), 160);

      setOpenUpwards(openUpwards);
      setMenuGeometry({
        left: rect.left,
        top: openUpwards ? undefined : rect.bottom + 8,
        bottom: openUpwards ? viewportHeight - rect.top + 8 : undefined,
        width: rect.width,
        maxHeight
      });
    }

    function handlePointerDown(event: MouseEvent): void {
      const target = event.target as Node;
      const trigger = getTriggerElement();
      if (trigger?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }

      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpen(false);
        getTriggerElement()?.focus();
      }
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !menuRef.current || !menuGeometry) {
      return;
    }

    menuRef.current.style.left = `${menuGeometry.left}px`;
    menuRef.current.style.width = `${menuGeometry.width}px`;
    menuRef.current.style.maxHeight = `${menuGeometry.maxHeight}px`;
    menuRef.current.style.top = menuGeometry.top === undefined ? "" : `${menuGeometry.top}px`;
    menuRef.current.style.bottom = menuGeometry.bottom === undefined ? "" : `${menuGeometry.bottom}px`;
  }, [menuGeometry, open]);

  function handleSelect(nextValue: string): void {
    onChange(nextValue);
    setOpen(false);
    getTriggerElement()?.focus();
  }

  const rootClassName = ["ui-select", className].filter(Boolean).join(" ");

  return (
    <div className={rootClassName}>
      {searchable ? (
        <input
          id={triggerId}
          ref={triggerInputRef}
          type="text"
          className={`form-input ui-select-trigger ui-select-trigger-input ${open ? "is-open" : ""}`}
          aria-controls={open ? listboxId : undefined}
          aria-label={ariaLabel}
          disabled={disabled}
          title={title}
          value={open ? searchQuery : (selectedOption?.label ?? "")}
          placeholder={placeholder}
          onFocus={() => {
            if (!disabled) {
              setOpen(true);
              setSearchQuery("");
            }
          }}
          onChange={(event) => {
            setSearchQuery(event.target.value);
            if (!open) {
              setOpen(true);
            }
          }}
          onClick={() => {
            if (!disabled && !open) {
              setOpen(true);
              setSearchQuery("");
            }
          }}
        />
      ) : (
        <button
          id={triggerId}
          ref={triggerButtonRef}
          type="button"
          className={`form-input ui-select-trigger ${open ? "is-open" : ""}`}
          aria-haspopup="listbox"
          aria-controls={open ? listboxId : undefined}
          aria-label={ariaLabel}
          disabled={disabled}
          title={title}
          onClick={() => {
            if (!disabled) {
              setOpen((current) => !current);
            }
          }}
        >
          <span className={`ui-select-trigger-text ${selectedOption ? "" : "is-placeholder"}`}>
            {selectedOption?.label ?? placeholder ?? ""}
          </span>
        </button>
      )}

      {open && createPortal(
        <div
          ref={menuRef}
          className={`ui-select-menu ${openUpwards ? "is-upwards" : ""}`}
        >
          <div
            id={listboxId}
            role="listbox"
            aria-labelledby={triggerId}
          >
            {visibleOptions.map((option) => {
              const selected = option.value === value;

              return (
                <button
                  key={option.value}
                  type="button"
                  className={`ui-select-option ${selected ? "is-selected" : ""}`}
                  role="option"
                  disabled={option.disabled}
                  onClick={() => handleSelect(option.value)}
                >
                  <span className="ui-select-option-copy">
                    <span className="ui-select-option-label">{option.label}</span>
                    {option.description && <span className="ui-select-option-description">{option.description}</span>}
                  </span>
                  {selected && (
                    <span className="ui-select-option-check">
                      <IconCheck />
                    </span>
                  )}
                </button>
              );
            })}

            {!visibleOptions.length && (
              <div className="ui-select-empty">{searchPlaceholder ?? "No matching entries"}</div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}