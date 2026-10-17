/**
 * Send the browser to Paystack's hosted checkout.
 *
 * Paystack returns an authorization_url which redirects the student directly to
 * Paystack's secure checkout (cards, bank transfer, USSD). Returns false
 * (and does nothing) when the payment was settled automatically in demo mode.
 */
export function redirectToCheckout(payment) {
  const url = payment?.authorization_url || payment?.checkout?.url;
  if (!url) return false;

  // If fields are provided (legacy form POST), submit as form
  if (payment?.checkout?.fields && Object.keys(payment.checkout.fields).length > 0) {
    const form = document.createElement('form');
    form.method = payment.checkout.method || 'POST';
    form.action = url;
    form.style.display = 'none';

    Object.entries(payment.checkout.fields).forEach(([name, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();
    return true;
  }

  // Paystack hosted checkout URL: navigate directly
  window.location.href = url;
  return true;
}
