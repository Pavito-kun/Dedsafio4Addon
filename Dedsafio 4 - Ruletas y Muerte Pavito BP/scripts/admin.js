export const ADMIN_TAG = "admin";

export function isAdmin(player) {
	try {
		return player?.hasTag(ADMIN_TAG) === true;
	} catch {
		return false;
	}
}

export function sendAdminMessage(player, message) {
	if (!isAdmin(player)) return false;
	try {
		player.sendMessage(message);
		return true;
	} catch {
		return false;
	}
}
