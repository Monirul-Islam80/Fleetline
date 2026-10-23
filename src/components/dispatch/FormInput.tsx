"use client";

import { memo, type ComponentProps } from "react";
import { registerFocus, type FocusTarget } from "@/lib/focusRegistry";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fieldChanged, type TextField } from "@/store/slices/bookingSlice";
import { Input } from "../ui/controls";

type FormInputProps = Omit<ComponentProps<typeof Input>, "value" | "onChange" | "error"> & {
  field: TextField;
  focus?: FocusTarget;
  /** Runs after the store has the new value, e.g. caller lookup. */
  onAfterChange?: () => void;
};

/**
 * A text input bound to one booking-form field. Each instance subscribes only to its own value
 * and error, so typing in one field re-renders one field.
 */
export const FormInput = memo(function FormInput({ field, focus, onAfterChange, ...rest }: FormInputProps) {
  const dispatch = useAppDispatch();
  const value = useAppSelector((st) => st.booking.form[field]);
  const error = useAppSelector((st) => st.booking.errors[field]);
  return (
    <Input
      ref={focus ? registerFocus(focus) : undefined}
      value={value}
      error={error}
      onChange={(e) => {
        dispatch(fieldChanged({ field, value: e.target.value }));
        onAfterChange?.();
      }}
      {...rest}
    />
  );
});
