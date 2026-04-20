export interface DeviceInfo {
  deviceId: string;
  label: string;
}

export async function enumerateAudioDevices(): Promise<{ inputs: DeviceInfo[]; outputs: DeviceInfo[] }> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return { inputs: [], outputs: [] };
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  const inputs: DeviceInfo[] = [];
  const outputs: DeviceInfo[] = [];
  for (const d of devices) {
    const info = { deviceId: d.deviceId, label: d.label || `${d.kind} (${d.deviceId.slice(0, 6)})` };
    if (d.kind === "audioinput") inputs.push(info);
    else if (d.kind === "audiooutput") outputs.push(info);
  }
  return { inputs, outputs };
}

export async function requestMicPermission(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  stream.getTracks().forEach((t) => t.stop());
}
