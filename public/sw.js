/* Karma Service Worker: Push-Nachrichten mit Zusagen und Ablehnen */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Karma", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Karma";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/badge-96.png",
    tag: data.r || "karma",
    renotify: true,
    data,
    actions: data.r
      ? [
          { action: "accept", title: "Zusagen" },
          { action: "decline", title: "Ablehnen" },
        ]
      : [],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

async function sendAction(data, action) {
  const res = await fetch(data.actionUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ r: data.r, u: data.u, t: data.t, a: action }),
  });
  const json = await res.json().catch(() => ({}));
  return json.status || (res.ok ? "ok" : "error");
}

async function openUrl(url) {
  const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const c of all) {
    if ("focus" in c) {
      await c.focus();
      if ("navigate" in c) return c.navigate(url);
      return;
    }
  }
  return self.clients.openWindow(url);
}

self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data || {};
  const url = data.url || "/app";
  event.notification.close();

  if (event.action === "accept" && data.actionUrl) {
    event.waitUntil(
      sendAction(data, "accept")
        .then((status) => {
          const text =
            status === "accepted"
              ? "Du bist dabei. Verabredet euch im Chat."
              : status === "offered"
                ? "Zusage gesendet. Du bekommst Bescheid."
                : status === "request_full"
                  ? "Hier sind schon genug Leute dabei. Danke!"
                  : "Das hat nicht geklappt. Öffne die Anfrage in Karma.";
          return self.registration.showNotification("Karma", {
            body: text,
            icon: "/icon-192.png",
            tag: (data.r || "karma") + "-ok",
            data: { url },
          });
        })
        .catch(() => openUrl(url)),
    );
    return;
  }
  if (event.action === "decline" && data.actionUrl) {
    event.waitUntil(sendAction(data, "decline").catch(() => undefined));
    return;
  }
  event.waitUntil(openUrl(url));
});
