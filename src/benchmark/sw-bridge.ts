import { SW_MESSAGE, type SWMessageType, type SWRequest, type SWResponse } from '../sw-messages';

function sendToSW<T extends SWMessageType>(type: T): Promise<SWResponse<T> | null> {
  const sw = navigator.serviceWorker?.controller;
  if (!sw) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event: MessageEvent<SWResponse<T>>) => {
      resolve(event.data);
    };

    const request: SWRequest = { type };
    sw.postMessage(request, [channel.port2]);
  });
}

export function fetchSWMetrics() {
  return sendToSW(SW_MESSAGE.GET_METRICS);
}

export function resetSWMetrics() {
  return sendToSW(SW_MESSAGE.RESET_METRICS);
}

export function clearSWCache() {
  return sendToSW(SW_MESSAGE.CLEAR_CACHE);
}
