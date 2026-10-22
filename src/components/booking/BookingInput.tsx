"use client";

import { memo, useMemo, type ChangeEvent } from "react";
import { registerFocus, type FocusTarget } from "@/lib/focusRegistry";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fieldChanged, type TextField as FormField } from "@/store/slices/bookingSlice";
import { TextField, type TextFieldProps } from "../ui/TextField";

interface BookingInputProps extends Omit<TextFieldProps, "value" | "onChange" | "error"> {
  field: FormField;
  focus?: FocusTarget;
  /** Runs after the store has the new value, e.g. caller lookup. */
  onAfterChange?: () => void;
}

/**
 * A text input bound to one booking-form field in Redux. Each instance subscribes to its own
 * value and error only, so typing in one field re-renders only that field.
 */
export const BookingInput = memo(function BookingInput({ field, focus, onAfterChange, ...rest }: BookingInputProps) {
  const dispatch = useAppDispatch();
  const value = useAppSelector((s) => s.booking.form[field]);
  const error = useAppSelector((s) => s.booking.errors[field]);
  const ref = useMemo(() => (focus ? registerFocus(focus) : undefined), [focus]);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    dispatch(fieldChanged({ field, value: e.target.value }));
    onAfterChange?.();
  };

  return <TextField ref={ref} value={value} onChange={onChange} error={error} {...rest} />;
});
