/** Exact Flutterwave checkout origins; development checkout is test-key only. */
export function trustedFlutterwaveCheckout(value: string, testMode: boolean): URL | null {
  try {
    const url = new URL(value);
    const hosts = ['checkout.flutterwave.com', 'ravemodal.flutterwave.com'];
    if (testMode) hosts.push('checkout-v2.dev-flutterwave.com');
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      hosts.includes(url.hostname)
      ? url
      : null;
  } catch {
    return null;
  }
}
