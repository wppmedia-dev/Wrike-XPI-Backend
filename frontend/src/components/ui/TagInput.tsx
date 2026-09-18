import { useCallback, useEffect, useRef, useState } from "react";
import "./TagInput.css";

/**
 * A list field built out of chips: type a value, press Enter or comma, repeat.
 * A pasted list — commas, newlines, tabs or semicolons — lands as many chips in
 * one go, so a column copied out of a spreadsheet arrives intact.
 *
 * Refusing a duplicate is the whole point of this component, so it does it
 * loudly rather than quietly:
 *
 *   · a value that is already a chip is dropped and the chip it collides with
 *     flashes, because that chip is the thing the admin needs to look at;
 *   · a value that is already stored elsewhere — the `existing` set, i.e. the
 *     rows this form would duplicate — is dropped and the FIELD flashes, since
 *     there is no chip to point at. Without this the only feedback would be a
 *     409 after submitting; *   · a value the SERVER would refuse — a malformed email, a domain that is
     not a domain — never becomes a chip either (see the `validate` prop). It
     is handed back into the field, selected, so it can be typed over instead
     of being retyped from the message; *   · either way the reason is spelled out underneath, and stays there until
 *     the next commit, so it is still readable while the admin carries on.
 *
 * Values are compared through `toKey`, never raw: an allow-list domain may be
 * written "@company.com" or "company.com" and both are the same entry to the
 * server, so the caller owns what "the same value" means.
 */

/** Commas, semicolons and any whitespace separate values. No value this
    component is used for may itself contain whitespace, so this is safe. */
const SPLIT = /[\s,;]+/;

/** How long a refusal stays highlighted. Long enough to catch the eye of
    someone who pasted and immediately looked elsewhere. */
const FLASH_MS = 1600;

/** Past this many refusals in one go the notice summarises instead of listing;
    a wall of twelve sentences is not read, it is dismissed. */
const NOTICE_MAX = 3;

const defaultToKey = (value: string) => value.trim().toLowerCase();

const splitEntries = (raw: string): string[] => {
  const values: string[] = [];
  for (const piece of raw.split(SPLIT)) {
    const value = piece.trim();
    if (value) values.push(value);
  }
  return values;
};

type Flash = { kind: "chip"; key: string } | { kind: "field" } | null;

export interface TagInputProps {
  /** Id of the inner input, so the caller's <label htmlFor> still works. */
  id?: string;
  values: string[];
  onChange: (next: string[]) => void;
  /** Keys already stored elsewhere — refused, and the field flashes. */
  existing?: ReadonlySet<string>;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  /** Maps a value to its comparison key. Defaults to trim + lower-case. */
  toKey?: (value: string) => string;
  /**
   * Returns the reason a value may not be added, or null when it is fine.
   * A refused value is kept in the field, not added, so the caller never has
   * to deal with a bad value at submit time.
   */
  validate?: (value: string) => string | null;
  duplicateMessage?: (value: string) => string;
  existingMessage?: (value: string) => string;
}

export function TagInput({
  id,
  values,
  onChange,
  existing,
  placeholder,
  disabled = false,
  ariaLabel,
  toKey = defaultToKey,
  validate,
  duplicateMessage = (value) => `"${value}" is already in this list.`,
  existingMessage = (value) => `"${value}" is already in use and was not added.`,
}: TagInputProps) {
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const flashFor = (next: Flash) => {
    if (timer.current) clearTimeout(timer.current);
    setFlash(next);
    // Timed, not cleared on the next keystroke: the highlight has to outlive
    // the typing that usually follows a paste, or it is never seen.
    timer.current = setTimeout(() => setFlash(null), FLASH_MS);
  };

  const commit = useCallback(
    (raw: string) => {
      const pieces = splitEntries(raw);
      if (!pieces.length) return;

      const seen = new Set(values.map(toKey));
      const taken = new Set<string>();
      existing?.forEach((value) => taken.add(toKey(value)));

      const added: string[] = [];
      const refused: string[] = [];
      /** Refused for its format, so worth keeping on screen to correct. */
      const invalid: string[] = [];
      let chipHit: string | null = null;
      let fieldHit = false;

      for (const value of pieces) {
        const key = toKey(value);

        if (seen.has(key)) {
          refused.push(duplicateMessage(value));
          chipHit = chipHit ?? key;
          continue;
        }
        if (taken.has(key)) {
          refused.push(existingMessage(value));
          fieldHit = true;
          continue;
        }

        // Format last: a value that is already stored is valid by definition,
        // and "not a valid email" is the more useful thing to say about one
        // that is not.
        const reason = validate?.(value);
        if (reason) {
          refused.push(reason);
          invalid.push(value);
          fieldHit = true;
          continue;
        }

        seen.add(key);
        added.push(value);
      }

      if (added.length) onChange([...values, ...added]);
      /* The field is emptied on every commit EXCEPT for values refused for
         their format: those go back in, selected, so the fix is to type over
         them. "" would have thrown the admin's typing away, and a chip would
         have made an unfixable entry that only fails again at submit. */
      setDraft(invalid.join(", "));
      if (invalid.length) requestAnimationFrame(() => inputRef.current?.select());

      if (!refused.length) {
        setNotice(null);
        setFlash(null);
        return;
      }

      setNotice(
        refused.length <= NOTICE_MAX
          ? refused.join(" ")
          : `${refused.slice(0, NOTICE_MAX).join(" ")} and ${refused.length - NOTICE_MAX} more.`,
      );
      // Pointing at the chip that collided is more useful than pointing at the
      // field, so it wins when both kinds of refusal came out of one paste.
      flashFor(chipHit ? { kind: "chip", key: chipHit } : fieldHit ? { kind: "field" } : null);
    },
    [values, existing, onChange, toKey, validate, duplicateMessage, existingMessage],
  );

  const removeAt = (key: string) => {
    onChange(values.filter((value) => toKey(value) !== key));
    setNotice(null);
    if (flash?.kind === "chip" && flash.key === key) setFlash(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === ";") {
      // Enter would otherwise submit the form the field sits in — or, in a
      // form with no submit button, do nothing visible at all.
      e.preventDefault();
      if (draft.trim()) commit(draft);
      return;
    }

    // Tab commits without preventDefault: fast list entry should not trap the
    // keyboard, so focus moves on and the value is taken with it.
    if (e.key === "Tab") {
      if (draft.trim()) commit(draft);
      return;
    }

    if (e.key === "Backspace" && !draft && values.length) {
      onChange(values.slice(0, -1));
      setNotice(null);
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (splitEntries(text).length < 2) return; // one value: let the browser do it
    e.preventDefault();
    commit(draft ? `${draft} ${text}` : text);
  };

  return (
    <div className="ti-root">
      <div
        className={`ti-field${flash?.kind === "field" ? " ti-field-refused" : ""}${
          disabled ? " ti-field-disabled" : ""
        }`}
        // The whole box behaves like the input, including the gaps between
        // chips, so a click next to a chip lands the caret where it looks like
        // it should.
        onClick={() => inputRef.current?.focus()}
      >
        {values.map((value) => {
          const key = toKey(value);
          const refused = flash?.kind === "chip" && flash.key === key;

          return (
            <span key={key} className={`ti-chip${refused ? " ti-chip-refused" : ""}`}>
              <span className="ti-chip-text" title={value}>
                {value}
              </span>
              <button
                type="button"
                className="ti-chip-x"
                aria-label={`Remove ${value}`}
                disabled={disabled}
                onClick={(e) => {
                  // The field's own click handler would put the caret back.
                  e.stopPropagation();
                  removeAt(key);
                }}
              >
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            </span>
          );
        })}

        <input
          id={id}
          ref={inputRef}
          className="ti-input"
          type="text"
          value={draft}
          disabled={disabled}
          placeholder={values.length ? "" : placeholder}
          aria-label={ariaLabel}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          // A typed value that is never committed would otherwise be dropped
          // silently when the modal's Add button is pressed.
          onBlur={() => {
            if (draft.trim()) commit(draft);
          }}
        />
      </div>

      {notice && (
        <div className="ti-notice" role="status">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          <span>{notice}</span>
        </div>
      )}
    </div>
  );
}
