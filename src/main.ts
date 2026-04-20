import { SipClient } from "./sip";
import { FakeSipClient } from "./mock";
import type { SipClientLike } from "./types";
import { bindUi } from "./ui";

const remoteAudio = document.getElementById("remote-audio") as HTMLAudioElement | null;
if (!remoteAudio) throw new Error("Missing #remote-audio element");

const params = new URLSearchParams(window.location.search);
const mockMode = params.get("mock") === "1" || localStorage.getItem("sip-mock") === "1";

const client: SipClientLike = mockMode ? new FakeSipClient() : new SipClient(remoteAudio);

bindUi(client, { mockMode });

window.addEventListener("beforeunload", () => {
  client.disconnect().catch(() => undefined);
});
