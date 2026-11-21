(async () => {
  const info = {
    userAgent: navigator.userAgent,
    platform: navigator.userAgentData?.platform || navigator.platform,
    language: navigator.language,
    screen: `${screen.width}x${screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    referrer: document.referrer || "direct",
    page: location.href,
    cores: navigator.hardwareConcurrency,
    memoryGB: navigator.deviceMemory,
    touch: navigator.maxTouchPoints > 0,
  };

  try {
    const h = await navigator.userAgentData?.getHighEntropyValues(["model", "platformVersion"]);
    if (h) {
      info.deviceModel = h.model;
      info.osVersion = h.platformVersion;
    }
  } catch {}

  fetch("/api/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(info),
  }).catch(() => {});
})();
