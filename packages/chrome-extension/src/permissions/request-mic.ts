document.getElementById("grantBtn")!.addEventListener("click", async () => {
  const statusEl = document.getElementById("status")!;
  const btn = document.getElementById("grantBtn") as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = "Requesting...";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    statusEl.textContent =
      "Permission granted! You can close this tab and try Voice again.";
    statusEl.className = "status granted";
    btn.style.display = "none";
  } catch {
    statusEl.textContent =
      "Permission denied. Please allow microphone access in your browser settings.";
    statusEl.className = "status denied";
    btn.disabled = false;
    btn.textContent = "Try Again";
  }
});
