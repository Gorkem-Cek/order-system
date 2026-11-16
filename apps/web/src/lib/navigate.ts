/** Leaves the app for another site (e.g. iyzico's payment page). Separate so tests can stub it. */
export function leaveTo(url: string): void {
  window.location.assign(url);
}
