import { trustedFlutterwaveCheckout } from '../../../src/billing/checkout-url';

describe('Flutterwave checkout origins', () => {
  it.each(['checkout.flutterwave.com', 'ravemodal.flutterwave.com'])(
    'accepts live host %s',
    (host) => {
      expect(
        trustedFlutterwaveCheckout(`https://${host}/v3/hosted/pay/test`, false),
      ).not.toBeNull();
    },
  );
  it('accepts the actual API test host only with test credentials', () => {
    const link = 'https://checkout-v2.dev-flutterwave.com/v3/hosted/pay/test';
    expect(trustedFlutterwaveCheckout(link, true)?.hostname).toBe(
      'checkout-v2.dev-flutterwave.com',
    );
    expect(trustedFlutterwaveCheckout(link, false)).toBeNull();
  });
  it.each([
    'https://checkout-v2.dev-flutterwave.com.evil.example/pay',
    'https://checkout.flutterwave.com.evil.example/pay',
    'https://user@checkout.flutterwave.com/pay',
    'https://checkout.flutterwave.com:444/pay',
    'http://checkout.flutterwave.com/pay',
    'https://checkout.paystack.com/pay',
    'javascript:alert(1)',
    'not a url',
  ])('rejects %s', (value) => {
    expect(trustedFlutterwaveCheckout(value, true)).toBeNull();
  });
});
