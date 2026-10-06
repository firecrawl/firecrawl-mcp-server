import { cn } from "./cn";
import { forwardRef } from "react";

const Input = forwardRef<HTMLInputElement, React.ComponentPropsWithoutRef<"input">>(
  ({ className, disabled, ...props }, ref) => {
    return (
      <label
        className={cn(
          "py-8 px-12 rounded-8 transition-all w-full block gap-4 cursor-text",
          "relative bg-surface",
          "before:inside-border before:border-black-alpha-8 hover:before:border-black-alpha-12 hover:bg-black-alpha-2 focus-within:!bg-surface focus-within:before:!border-heat-100 focus-within:before:!border-[1.25px]",
          "has-[:disabled]:cursor-not-allowed has-[:disabled]:hover:before:border-black-alpha-8 has-[:disabled]:hover:bg-surface",
          "text-body-medium",
          className,
        )}
      >
        <input
          ref={ref}
          disabled={disabled}
          className={cn(
            "outline-none w-full resize-none bg-transparent",
            disabled && "cursor-not-allowed",
          )}
          {...props}
        />
      </label>
    );
  },
);

Input.displayName = "Input";

export default Input;
