import { AnimatePresence, motion } from "motion/react";

import { cn } from "./cn";

// `id` and the aria props are forwarded so a caller can pair the box with real
// label text. Without them the control reaches assistive tech unnamed, which a
// public form with several boxes cannot afford.
export default function Checkbox({
  checked,
  onChange,
  disabled,
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
}: {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  /** Reaches assistive tech as disabled, not merely dimmed. */
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}) {
  return (
    <button
      aria-checked={checked}
      aria-describedby={ariaDescribedBy}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-disabled={disabled}
      className={cn("size-20 p-3 relative", disabled && "opacity-40 cursor-not-allowed")}
      disabled={disabled}
      id={id}
      role="checkbox"
      type="button"
      onClick={() => {
        if (disabled) return;
        onChange?.(!checked);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
        }
      }}
    >
      <div
        className={cn(
          "w-full h-full rounded-3 group before:inside-border relative transition-all",
          checked
            ? "bg-heat-100 group-hover:bg-[#FA4500] before:border-transparent"
            : "bg-black-alpha-3 group-hover:bg-black-alpha-6 before:border-black-alpha-10 group-hover:before:border-black-alpha-40",
        )}
        style={{
          boxShadow: checked
            ? "0px 2px 4px 0px rgba(255, 77, 0, 0.12), 0px 1px 1px 0px rgba(255, 77, 0, 0.12), 0px 0.5px 0.5px 0px rgba(255, 77, 0, 0.16), 0px 0.25px 0.25px 0px rgba(255, 77, 0, 0.20)"
            : "",
        }}
      >
        <AnimatePresence>
          {checked && (
            <motion.svg
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="absolute cs-10"
              exit={{ opacity: 0, scale: 0.9, y: 4 }}
              fill="none"
              height="10"
              initial={{ opacity: 0, scale: 0.9, y: 4 }}
              viewBox="0 0 10 10"
              width="10"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M2 5.98438L4.39062 8.375L8.375 2"
                stroke="white"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.25"
              />
            </motion.svg>
          )}
        </AnimatePresence>
      </div>
    </button>
  );
}
