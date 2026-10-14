import { system, world } from "@minecraft/server";

let lastHandledTick = -1;
let lastHandledMessage = "";

function handleFormattedChat(event) {
	const player = event.sender;
	const message = String(event.message ?? "").trim();
	if (player?.typeId !== "minecraft:player" || !message || message.startsWith("/")) return;

	event.cancel = true;

	const duplicateKey = `${player.id}\n${message}`;
	if (lastHandledTick === system.currentTick && lastHandledMessage === duplicateKey) return;
	lastHandledTick = system.currentTick;
	lastHandledMessage = duplicateKey;

	const formattedMessage = `\u00A7a${player.name}\u00A7r: ${message}`;
	system.run(() => world.sendMessage(formattedMessage));
}

const chatSendSignal = world.beforeEvents.chatSend ?? world.beforeEvents.playerMessage;

if (chatSendSignal) {
	chatSendSignal.subscribe(handleFormattedChat);
} else {
	console.warn("[Dedsafio 4] La API experimental de chat no esta disponible. Activa el experimento Beta APIs.");
}
