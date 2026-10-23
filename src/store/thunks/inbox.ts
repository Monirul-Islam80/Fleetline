import { APP } from "@/config/app";
import type { ApiClient } from "@/api/client";
import type { BroadcastInput } from "@/types/api";
import { seeded } from "../actions";
import type { AppThunk } from "../index";
import { zoneFlagsCleared } from "../slices/fleetSlice";
import { alertDeleted, callTaken, chatDone, chatTaken, flightDeleted, staffMessageAdded } from "../slices/inboxSlice";
import { toastShown } from "../slices/uiSlice";

/**
 * Read-only calls: components use `dispatch(withApi((api) => api.searchX(query)))` and keep the
 * result in local state. Nothing about search results needs to live in Redux.
 */
export const withApi =
  <T>(call: (api: ApiClient) => Promise<T>): AppThunk<Promise<T>> =>
  (_dispatch, _getState, { api }) =>
    call(api);

/** Writes: call the API, then apply the change to the store. One helper keeps every write the same shape. */
function write(call: (api: ApiClient) => Promise<unknown>, onDone: AppThunk, success?: string): AppThunk<Promise<boolean>> {
  return async (dispatch, _getState, { api }) => {
    try {
      await call(api);
      dispatch(onDone);
      if (success) dispatch(toastShown({ tone: "success", text: success }));
      return true;
    } catch (error) {
      dispatch(toastShown({ tone: "danger", text: (error as Error).message }));
      return false;
    }
  };
}

export const sendStaffMessage = (to: string, body: string): AppThunk<Promise<boolean>> => async (dispatch, _getState, { api }) => {
  try {
    dispatch(staffMessageAdded(await api.sendStaffMessage(to, body)));
    dispatch(toastShown({ tone: "success", text: `Message sent to ${to}` }));
    return true;
  } catch (error) {
    dispatch(toastShown({ tone: "danger", text: (error as Error).message }));
    return false;
  }
};

export const sendBroadcast = (input: BroadcastInput) => write((api) => api.sendBroadcast(input), () => undefined, "Message sent to drivers");
export const takeChat = (id: string) => write((api) => api.takeChat(id), (d) => d(chatTaken({ id, by: APP.operator.name })));
export const closeChat = (id: string) => write((api) => api.closeChat(id), (d) => d(chatDone(id)));
export const takeCall = (id: string) => write((api) => api.takeCall(id), (d) => d(callTaken(id)));
export const deleteAlert = (id: string) => write((api) => api.deleteAlert(id), (d) => d(alertDeleted(id)));
export const deleteFlight = (id: string) => write((api) => api.deleteFlight(id), (d) => d(flightDeleted(id)));
export const clearZoneFlags = () => write((api) => api.clearZoneFlags(), (d) => d(zoneFlagsCleared()), "Zone flags cleared");

/** Loads the snapshot (initial data, or a reset of the demo). */
export const loadSnapshot = (): AppThunk<Promise<void>> => async (dispatch, _getState, { api }) => {
  try {
    const snapshot = await api.bootstrap();
    dispatch(seeded({ ...snapshot, now: Date.now() }));
  } catch (error) {
    dispatch(toastShown({ tone: "danger", text: `Could not load the board: ${(error as Error).message}` }));
  }
};
