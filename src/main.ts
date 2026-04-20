import { SipClient } from "./sip";
import { bindUi } from "./ui";

const remoteAudio = document.getElementById("remote-audio") as HTMLAudioElement | null;
if (!remoteAudio) throw new Error("Missing #remote-audio element");

const client = new SipClient(remoteAudio);
bindUi(client);

window.addEventListener("beforeunload", () => {
  client.disconnect().catch(() => undefined);
});
