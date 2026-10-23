import { VEHICLES } from "@/config/app";
import { digitsOnly } from "@/lib/format";
import { stopText } from "@/lib/stops";
import { fleetTimeToEpoch, parseFleetDate } from "@/lib/time";
import type { CreateJobInput } from "@/types/api";
import type { Job, Millis } from "@/types/domain";
import type { AppThunk, RootState } from "../index";
import { selectFormQuote } from "../selectors";
import {
  callerCleared,
  callerMatched,
  errorsSet,
  FORM_DEFAULTS,
  formLoaded,
  formReset,
  type BookingErrors,
  type BookingForm,
} from "../slices/bookingSlice";
import { jobAdded } from "../slices/jobsSlice";
import { toastShown } from "../slices/uiSlice";
import { makeEvent } from "./events";

const TIME_RE = /^([01]\d|2[0-3]):?([0-5]\d)$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Date and time fields to an epoch in fleet time. Empty time with no date means now. */
export function resolvePickupAt(form: Pick<BookingForm, "date" | "time">, now: Millis): Millis | null {
  const date = parseFleetDate(form.date, now);
  if (!date) return null;
  if (!form.time.trim()) return form.date.trim() ? null : now;
  const match = TIME_RE.exec(form.time.trim());
  return match ? fleetTimeToEpoch(date, Number(match[1]), Number(match[2])) : null;
}

const numberOr = (text: string, fallback: number): number => (text.trim() ? Number(text) : fallback);

function validate(form: BookingForm, state: RootState): BookingErrors {
  const errors: BookingErrors = {};
  const now = state.fleet.now;
  if (!form.pickup) errors.pickupText = form.pickupText ? "Pick an address from the list" : "Pickup is required";
  if (form.dropoffText && !form.dropoff) errors.dropoffText = "Pick an address from the list";
  if (!form.phone.trim() && !form.name.trim()) errors.name = "Name or phone is required";
  if (form.phone && digitsOnly(form.phone).length < 10) errors.phone = "Phone looks too short";
  if (form.email && !EMAIL_RE.test(form.email)) errors.email = "Check the email";
  const pickupAt = resolvePickupAt(form, now);
  if (!parseFleetDate(form.date, now)) errors.date = "Use dd/mm or tomorrow";
  else if (pickupAt === null) errors.time = form.time.trim() ? "Use 24h, e.g. 1430" : "Time needed";
  else if (pickupAt < now - 5 * 60_000) errors.time = "Time has passed";
  const pax = numberOr(form.passengers, FORM_DEFAULTS.passengers);
  const seats = VEHICLES[form.vehicle].seats;
  if (!Number.isInteger(pax) || pax < 1) errors.passengers = "Min 1";
  else if (pax > seats) errors.passengers = `Max ${seats}`;
  if (form.driverCallsign && !Object.values(state.fleet.drivers.entities).some((d) => d?.callsign === form.driverCallsign.trim())) {
    errors.driverCallsign = "Unknown driver";
  }
  if (form.fareText && !(Number(form.fareText) > 0)) errors.fareText = "Enter a fare";
  return errors;
}

/** Form state to the API payload. The server decides job number and status. */
function toCreateInput(form: BookingForm, state: RootState): CreateJobInput | null {
  if (!form.pickup) return null;
  const quote = selectFormQuote(state);
  const tariffFare = quote?.quotes.find((q) => q.tariffId === form.tariff)?.price ?? null;
  return {
    pickupAt: resolvePickupAt(form, state.fleet.now) ?? state.fleet.now,
    leadMin: numberOr(form.leadMin, FORM_DEFAULTS.leadMin),
    priority: numberOr(form.priority, FORM_DEFAULTS.priority),
    passengers: numberOr(form.passengers, FORM_DEFAULTS.passengers),
    taxis: numberOr(form.taxis, FORM_DEFAULTS.taxis),
    vehicle: form.vehicle,
    extras: form.extras.trim(),
    pickup: form.pickup,
    vias: form.vias.flatMap((v) => (v.stop ? [v.stop] : [])),
    dropoff: form.dropoff,
    customerName: form.name.trim().toUpperCase() || "CALLER",
    phone: form.phone.trim(),
    altPhone: form.altPhone.trim(),
    email: form.email.trim() || null,
    instructions: form.instructions.trim().toUpperCase(),
    customerNotes: form.customerNotes.trim(),
    operatorNotes: form.operatorNotes.trim(),
    excludeDrivers: form.excludeDrivers.split(/[\s,]+/).filter(Boolean),
    accountCode: form.account.trim() || null,
    payment: form.account.trim() ? "ACCOUNT" : "CASH",
    source: "PHONE",
    siteId: form.site.trim() || "wc",
    fare: form.fareText ? Number(form.fareText) : tariffFare,
    fareOverridden: Boolean(form.fareText),
    designatedCallsign: form.driverCallsign.trim() || null,
    options: form.options,
  };
}

/** F1: validate, send to the API, add the returned job, reset the form. Resolves true when saved. */
export const saveBooking = (): AppThunk<Promise<boolean>> => async (dispatch, getState, { api }) => {
  const state = getState();
  const { form } = state.booking;
  const errors = validate(form, state);
  const input = toCreateInput(form, state);
  if (Object.keys(errors).length || !input) {
    dispatch(errorsSet(errors));
    dispatch(toastShown({ tone: "warning", text: "Fix the highlighted fields to save" }));
    return false;
  }
  try {
    const job = await api.createJob(input);
    dispatch(jobAdded({ job, event: makeEvent(job.id, "CREATED", "Booked by phone", job.createdAt) }));
    dispatch(formReset());
    dispatch(toastShown({ tone: "success", text: `Job ${job.number} saved` }));
    return true;
  } catch (error) {
    dispatch(toastShown({ tone: "danger", text: `Not saved: ${(error as Error).message}` }));
    return false;
  }
};

/** Caller ID: a known number fills name, email and account. */
export const lookupCaller = (): AppThunk<Promise<void>> => async (dispatch, getState, { api }) => {
  const phone = getState().booking.form.phone;
  if (digitsOnly(phone).length < 7) {
    if (getState().booking.form.customerId) dispatch(callerCleared());
    return;
  }
  const customer = await api.lookupCustomer(phone).catch(() => null);
  if (getState().booking.form.phone !== phone) return; // the operator kept typing
  if (customer) dispatch(callerMatched({ customerId: customer.id, name: customer.name.toUpperCase(), email: customer.email, account: customer.accountCode }));
  else if (getState().booking.form.customerId) dispatch(callerCleared());
};

/** Loads a job into the form so the operator can book it again. */
export const copyJobToForm =
  (job: Job): AppThunk =>
  (dispatch) => {
    dispatch(
      formLoaded({
        phone: job.phone,
        name: job.customerName,
        email: job.email ?? "",
        instructions: job.instructions,
        account: job.accountCode ?? "",
        passengers: String(job.passengers),
        vehicle: job.vehicle,
        pickup: job.pickup,
        pickupText: stopText(job.pickup),
        dropoff: job.dropoff,
        dropoffText: job.dropoff ? stopText(job.dropoff) : "",
        vias: job.vias.map((stop) => ({ stop, text: stopText(stop), name: "", phone: "", notes: "" })),
      }),
    );
    dispatch(toastShown({ tone: "info", text: `Job ${job.number} copied into the form` }));
  };
