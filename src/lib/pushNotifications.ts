export async function sendExpoPushNotification(input: {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}) {
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: input.to,
      title: input.title,
      body: input.body,
      data: input.data ?? {},
      sound: 'default',
      priority: 'high',
      badge: 1,
    }),
  });

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    return { ok: false, status: response.status, json };
  }

  return { ok: true, status: response.status, json };
}
