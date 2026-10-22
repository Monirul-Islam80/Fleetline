import { APP, VEHICLES } from "@/config/app";
import { digitsOnly } from "@/lib/format";
import { makeId } from "@/lib/random";
import { stopText } from "@/lib/stops";
import { fleetTimeToEpoch, parseFleetDate } from "@/lib/time";
import type { Job, Millis, PaymentType } from "@/types/domain";
import type { AppThunk, RootState } from "../index";
import { selectFormQuote } from "../selectors";
import {
  callerCleared,
  callerMatched,
  errorsSet,
  formLoaded,
  formReset,
  emptyForm,
  type BookingErrors,
  type BookingForm,
} from "../slices/bookingSlice";
import { jobAdded } from "../slices/jobsSlice";
import { toastShown } from "../slices/uiSlice";
import { makeEvent } from "./events";

const TIME_RE = /^([01]\d|2[0-3]):?([0-5]\d)$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Resolves the date and time fields to an epoch, in the fleet's clock. Empty time = now. */
export function resolvePickupAt(form: BookingForm, now: Millis): Millis | null {
  const date = parseFleetDate(form.date, now);
  if (!date) return null;
  if (!form.time.trim()) return form.date.trim() ? null : now;
  const match = TIME_RE.exec(form.time.trim());
  if (!match) return null;
  return fleetTimeToEpoch(date, Number(match[1]), Number(match[2]));
}

function validate(form: BookingForm, state: RootState): BookingErrors {
  const errors: BookingErrors = {};
  const now = state.fleet.now;
  if (!form.pickup) errors.pickupText = form.pickupText ? "Choose an address from the list" : "Enter a pickup address";
  if (form.dropoffText && !form.dropoff) errors.dropoffText = "Choose an address from the list";
  if (!form.phone.trim() && !form.name.trim()) errors.name = "Enter a name or a phone number";
  if (form.phone && digitsOnly(form.phone).length < 10) errors.phone = "Phone number looks too short";
  if (form.email && !EMAIL_RE.test(form.email)) errors.email = "Check the email address";
  const pickupAt = resolvePickupAt(form, now);
  if (!parseFleetDate(form.date, now)) errors.date = "Use dd/mm, tomorrow or +2";
  else if (pickupAt === null) errors.time = form.time.trim() ? "Use 24-hour time, e.g. 14:30" : "Add a time for a future day";
  else if (pickupAt < now - 5 * 60_000) errors.time = "That time has passed";
  const seats = VEHICLES[form.vehicle].seats;
  const pax = Number(form.passengers);
  if (!Number.isInteger(pax) || pax < 1) errors.passengers = "At least 1";
  else if (pax > seats) errors.passengers = `${VEHICLES[form.vehicle].label} seats ${seats}`;
  if (form.driverCallsign) {
    const exists = Object.values(state.fleet.drivers.entities).some((d) => d?.callsign === form.driverCallsign.trim());
    if (!exists) errors.driverCallsign = "No driver with that callsign";
  }
  if (form.fareText && !(Number(form.fareText) > 0)) errors.fareText = "Enter a fare in pounds";
  return errors;
}

/** Validates the form and creates the job. Returns true when saved. */
export const saveBooking = (): AppThunk<boolean> => (dispatch, getState) => {
  const state = getState();
  const form = state.booking.form;
  const errors = validate(form, state);
  if (Object.keys(errors).length) {
    dispatch(errorsSet(errors));
    dispatch(toastShown({ tone: "warning", text: "Fix the highlighted fields to save" }));
    return false;
  }
  const pickup = form.pickup;
  if (!pickup) return false;

  const now = state.fleet.now;
  const pickupAt = resolvePickupAt(form, now) ?? now;
  const leadMin = Number(form.leadMin) || APP.defaultLeadMin;
  const isAsap = pickupAt - now <= leadMin * 60_000;
  const quote = selectFormQuote(state);
  const tariffFare = quote?.quotes.find((q) => q.tariffId === form.tariff)?.price ?? null;
  const fare = form.fareText ? Number(form.fareText) : tariffFare;
  const designated = form.driverCallsign
    ? Object.values(state.fleet.drivers.entities).find((d) => d?.callsign === form.driverCallsign.trim())
    : undefined;
  const payment: PaymentType = form.account ? "ACCOUNT" : "CASH";

  const job: Job = {
    id: makeId("job"),
    number: state.jobs.nextNumber,
    status: isAsap ? "NEW" : "BOOKED",
    pickupAt,
    isAsap: !form.time,
    leadMin,
    priority: Number(form.priority) || 5,
    passengers: Number(form.passengers) || 1,
    taxis: Number(form.taxis) || 1,
    vehicle: form.vehicle,
    pickup,
    vias: form.vias,
    dropoff: form.dropoff,
    customerName: form.name.trim() || "Caller",
    phone: form.phone.trim(),
    email: form.email.trim() || null,
    instructions: form.instructions.trim(),
    accountCode: form.account.trim() || null,
    payment,
    source: "PHONE",
    fare,
    fareOverridden: Boolean(form.fareText),
    driverId: null,
    designatedDriverId: designated?.id ?? null,
    offer: null,
    missedBy: [],
    flightNo: null,
    isRecurring: false,
    createdAt: now,
    updatedAt: now,
    statusSince: now,
  };

  dispatch(jobAdded({ job, event: makeEvent(job.id, "CREATED", "Booked by phone", now) }));
  dispatch(formReset());
  dispatch(toastShown({ tone: "success", text: `Job ${job.number} saved${isAsap ? ", dispatching now" : ""}` }));
  return true;
};

/** Matches the phone field against known customers. Placeholder for GET /customers/lookup. */
export const lookupCaller = (): AppThunk => (dispatch, getState) => {
  const state = getState();
  const digits = digitsOnly(state.booking.form.phone);
  if (digits.length < 7) {
    if (state.booking.form.customerId) dispatch(callerCleared());
    return;
  }
  const customer = state.fleet.customers.find((c) => digitsOnly(c.phone).endsWith(digits) || digits.endsWith(digitsOnly(c.phone)));
  if (customer) {
    if (customer.id !== state.booking.form.customerId) {
      dispatch(callerMatched({ customerId: customer.id, name: customer.name, email: customer.email, account: customer.accountCode }));
    }
  } else if (state.booking.form.customerId) {
    dispatch(callerCleared());
  }
};

/** Copies an existing job into the form so the operator can rebook it. */
export const duplicateIntoForm = (job: Job): AppThunk => (dispatch) => {
  dispatch(
    formLoaded({
      ...emptyForm(),
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
      vias: job.vias,
    }),
  );
  dispatch(toastShown({ tone: "info", text: `Job ${job.number} copied into the form` }));
};
