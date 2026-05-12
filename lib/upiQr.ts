/** UPI intent URL for QR (pa = payee address, am = amount, tn = note). */
export function buildUpiPayUrl(upiId: string, amountRupee: number, note: string) {
  const pa = encodeURIComponent(upiId.trim());
  const am = encodeURIComponent(String(Math.round(amountRupee * 100) / 100));
  const tn = encodeURIComponent(note.slice(0, 80));
  return `upi://pay?pa=${pa}&am=${am}&tn=${tn}`;
}

export function buildUpiQrImageUrl(upiId: string, amountRupee: number, note: string) {
  const data = buildUpiPayUrl(upiId, amountRupee, note);
  return `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(data)}`;
}
