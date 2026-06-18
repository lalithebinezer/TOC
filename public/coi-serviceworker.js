/*! coi-serviceworker v0.1.7 | MIT License | https://github.com/gzguidoti/coi-serviceworker */
const coopName = "Cross-Origin-Opener-Policy";
const coepName = "Cross-Origin-Embedder-Policy";

if (typeof window !== "undefined") {
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register(window.document.currentScript.src)
            .then(registration => {
                registration.addEventListener("updatefound", () => {
                    window.location.reload();
                });
                if (registration.active && !navigator.serviceWorker.controller) {
                    window.location.reload();
                }
            });
    }
} else {
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
    self.addEventListener("fetch", (event) => {
        if (event.request.cache === "only-if-cached" && event.request.mode !== "same-origin") {
            return;
        }
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    if (response.status === 0) {
                        return response;
                    }
                    const newHeaders = new Headers(response.headers);
                    newHeaders.set(coopName, "same-origin");
                    newHeaders.set(coepName, "require-corp");
                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders
                    });
                })
                .catch(e => {
                    console.error(e);
                })
        );
    });
}
