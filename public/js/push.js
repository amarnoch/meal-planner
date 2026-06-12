/**
 * Notification enrolment. iOS requires the app to be installed to the Home
 * Screen (iOS 16.4+) before Notification/PushManager exist, so callers should
 * surface canUsePush() in the UI.
 */

import { getFamilyKey, getDeviceId } from './sync.js';

export function canUsePush() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function b64urlToUint8(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('sw.js');
  } catch (_) {
    return null;
  }
}

async function sendSubscription(subscription, label) {
  const res = await fetch('/api/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getFamilyKey()}` },
    body: JSON.stringify({ deviceId: getDeviceId(), label: label || '', subscription: subscription.toJSON() })
  });
  if (!res.ok) throw new Error('Could not save the subscription.');
}

/** Returns {ok} or throws with a user-readable message. */
export async function enableReminders(label) {
  if (!canUsePush()) {
    throw new Error(isStandalone()
      ? 'Notifications need iOS 16.4 or later.'
      : 'First add the app to your Home Screen (Share → Add to Home Screen), then enable reminders from there.');
  }
  const reg = await registerServiceWorker();
  if (!reg) throw new Error('Could not register the service worker.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications were not allowed. You can change this in Settings → Notifications.');

  const vapidRes = await fetch('/api/vapid');
  const { publicKey } = await vapidRes.json();
  if (!publicKey) throw new Error('Notifications are not configured on the server yet.');

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: b64urlToUint8(publicKey)
  });
  await sendSubscription(subscription, label);
  return { ok: true };
}

/** Re-save the existing subscription on launch so the server copy never goes stale. */
export async function revalidateSubscription() {
  if (!canUsePush() || !getFamilyKey()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    if (sub) await sendSubscription(sub);
  } catch (_) { /* best-effort */ }
}

export async function remindersEnabled() {
  if (!canUsePush()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    return !!sub && Notification.permission === 'granted';
  } catch (_) {
    return false;
  }
}

export async function sendTestNotification() {
  const res = await fetch('/api/notify-test', {
    method: 'POST',
    headers: { Authorization: `Bearer ${getFamilyKey()}` }
  });
  if (!res.ok) throw new Error('Test failed — check the family key.');
  return res.json();
}
