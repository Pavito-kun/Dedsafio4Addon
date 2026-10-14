import { ButtonState, CameraShakeType, InputButton, system, world } from "@minecraft/server";
import { prepareDimensionForPlayer } from "./dimensions.js";

const SHIP_ID = "pavi:nave_espacial";
const EARTH_PARTICLE_ID = "pavi:earth_atmosphere";
const OVERWORLD_ID = "minecraft:overworld";
const GLEBA_ID = "pavi:gleba";
const COUNTDOWN_TICKS = 10 * 20;
const ASCENT_TARGET_Y = 400;
const OVERWORLD_ASCENT_LIMIT_Y = 300;
const ATMOSPHERE_Y = 300;
const GLEBA_ENTRY_Y = 300;
const GLEBA_LANDING_Y = 62.2;
const DESCENT_TICKS = 10 * 20;
const activeFlights = new Map();

world.afterEvents.playerInteractWithEntity.subscribe((event) => {
	if (event.target.typeId !== SHIP_ID) return;
	const { player, target: ship } = event;
	if (player.dimension.id !== OVERWORLD_ID) {
		player.sendMessage("\u00A7cLa nave solo puede despegar desde el Overworld.");
		return;
	}
	if ([...activeFlights.values()].some((flight) => flight.playerId === player.id || flight.shipId === ship.id)) return;
	try { ship.getComponent("minecraft:rideable")?.addRider(player); }
	catch { /* The interaction may already have mounted the player. */ }
	activeFlights.set(ship.id, {
		ship,
		shipId: ship.id,
		player,
		playerId: player.id,
		phase: "waiting_for_jump",
		waitTicks: 0,
		countdownTicks: 0,
		originDimension: player.dimension,
		rotation: player.getRotation(),
	});
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
	for (const [shipId, flight] of activeFlights) {
		if (flight.playerId !== playerId) continue;
		activeFlights.delete(shipId);
		try { if (flight.ship.isValid) flight.ship.remove(); } catch { /* entity may already be unloaded */ }
	}
});

system.runInterval(updateFlights, 1);

function updateFlights() {
	for (const [shipId, flight] of activeFlights) {
		try {
			if (!flight.player.isValid || !flight.ship.isValid) {
				activeFlights.delete(shipId);
				continue;
			}
			if (flight.phase === "waiting_for_jump" || flight.phase === "countdown") {
				updateCountdown(flight, shipId);
				continue;
			}
			if (flight.phase === "ascent") updateAscent(flight, shipId);
			else if (flight.phase === "preparing_gleba") updateDimensionPreparation(flight, shipId);
			else if (flight.phase === "descent") updateDescent(flight, shipId);
		} catch (error) {
			console.warn(`[Dedsafio 4] Falló el vuelo de la nave: ${error}`);
			cancelFlight(flight, shipId, "\u00A7cEl vuelo se canceló por un error.");
		}
	}
}

function updateCountdown(flight, shipId) {
	const jumping = isJumpHeld(flight.player);
	if (!jumping) {
		if (flight.phase === "countdown") {
			cancelFlight(flight, shipId, null);
			return;
		}
		flight.waitTicks++;
		if (flight.waitTicks > 100) activeFlights.delete(shipId);
		return;
	}
	if (flight.phase === "waiting_for_jump") {
		flight.phase = "countdown";
		showCountdownTitle(flight.player, 10);
	}
	flight.countdownTicks++;
	if (flight.countdownTicks % 20 === 0) {
		const remaining = Math.max(0, COUNTDOWN_TICKS - flight.countdownTicks) / 20;
		if (remaining > 0) showCountdownTitle(flight.player, remaining);
	}
	if (flight.countdownTicks >= COUNTDOWN_TICKS) {
		clearCountdownTitle(flight.player);
		flight.phase = "ascent";
		flight.phaseTicks = 0;
		flight.ascentY = flight.ship.location.y;
		flight.startX = flight.ship.location.x;
		flight.startZ = flight.ship.location.z;
		shakeCamera(flight.player, 0.35, 2);
	}
}

function updateAscent(flight, shipId) {
	flight.phaseTicks++;
	const elapsedSeconds = flight.phaseTicks / 20;
	const speed = Math.min(25, 0.35 + elapsedSeconds * 1.0);
	applyShipVerticalSpeed(flight.ship, speed / 20);
	flight.ascentY = flight.ship.location.y;
	if (flight.phaseTicks % 40 === 0) shakeCamera(flight.player, 0.12, 2.2);
	if (flight.ascentY >= ATMOSPHERE_Y && !flight.atmosphereParticleSpawned) {
		const atmospherePoint = {
			x: flight.startX,
			y: ATMOSPHERE_Y - 10,
			z: flight.startZ,
		};
		if (flight.originDimension.isChunkLoaded(atmospherePoint)) {
			flight.atmosphereParticleSpawned = true;
			try { flight.originDimension.spawnParticle(EARTH_PARTICLE_ID, atmospherePoint); }
			catch { /* the visual particle must not interrupt the flight */ }
		}
	}
	if (flight.ascentY >= OVERWORLD_ASCENT_LIMIT_Y) beginGlebaTransfer(flight, shipId);
}

function beginGlebaTransfer(flight, shipId) {
	flight.phase = "preparing_gleba";
	flight.player.onScreenDisplay.setActionBar("§dEntrando en Gleba...");
	const destination = world.getDimension(GLEBA_ID);
	const arrival = { x: 0.5, y: Math.max(GLEBA_ENTRY_Y, flight.ship.location.y), z: 0.5 };
	flight.ship.clearVelocity();
	flight.ship.teleport(arrival, { dimension: destination, rotation: { x: 0, y: flight.rotation.y }, checkForBlocks: false });
	flight.player.teleport(arrival, { dimension: destination, rotation: flight.rotation, checkForBlocks: false });
	try { flight.ship.getComponent("minecraft:rideable")?.addRider(flight.player); }
	catch { /* The handoff may preserve the rider automatically. */ }
	flight.startX = arrival.x;
	flight.startZ = arrival.z;
	flight.ascentY = arrival.y;
	flight.preparePromise = prepareDimensionForPlayer(flight.player, GLEBA_ID);
	flight.preparePromise.then((ready) => {
		const current = activeFlights.get(shipId);
		if (current !== flight || !flight.player.isValid || !flight.ship.isValid) return;
		if (!ready) {
			cancelFlight(flight, shipId, null);
			return;
		}
		flight.glebaReady = true;
		flight.phaseTicks = 0;
		flight.player.sendMessage("\u00A7dGleba detectada. Descenso automático: 10 segundos.");
	}).catch((error) => {
		console.warn(`[Dedsafio 4] No se pudo preparar Gleba para la nave: ${error}`);
		cancelFlight(flight, shipId, null);
	});
}

function updateDimensionPreparation(flight) {
	flight.phaseTicks++;
	const elapsedSeconds = flight.phaseTicks / 20;
	const speed = Math.min(25, 0.35 + elapsedSeconds * 1.0);
	if (flight.ship.location.y < ASCENT_TARGET_Y) {
		applyShipVerticalSpeed(flight.ship, speed / 20);
		flight.ascentY = flight.ship.location.y;
		if (flight.phaseTicks % 40 === 0) shakeCamera(flight.player, 0.12, 2.2);
		return;
	}
	flight.ship.clearVelocity();
	if (flight.glebaReady) beginDescent(flight);
}

function updateDescent(flight, shipId) {
	flight.phaseTicks++;
	const remainingTicks = Math.max(1, DESCENT_TICKS - flight.phaseTicks + 1);
	const remainingDistance = flight.ship.location.y - GLEBA_LANDING_Y;
	applyShipVerticalSpeed(flight.ship, -Math.max(0, remainingDistance) / remainingTicks);
	flight.player.onScreenDisplay.setActionBar(`§dDescendiendo a Gleba §f${Math.ceil((DESCENT_TICKS - flight.phaseTicks) / 20)}s`);
	if (flight.phaseTicks >= DESCENT_TICKS) {
		flight.ship.clearVelocity();
		try { flight.ship.getComponent("minecraft:rideable")?.ejectRiders(); }
		catch { /* The player can dismount if the component is unavailable. */ }
		flight.ship.remove();
		flight.player.onScreenDisplay.setActionBar("§aAterrizaje completado.");
		clearCountdownTitle(flight.player);
		activeFlights.delete(shipId);
	}
}

function applyShipVerticalSpeed(ship, blocksPerTick) {
	ship.clearVelocity();
	ship.applyImpulse({ x: 0, y: blocksPerTick, z: 0 });
}

function beginDescent(flight) {
	flight.phase = "descent";
	flight.phaseTicks = 0;
	flight.ship.clearVelocity();
}

function cancelFlight(flight, shipId, message) {
	activeFlights.delete(shipId);
	try {
		if (flight.player.isValid) {
		clearCountdownTitle(flight.player);
			try { flight.ship.clearVelocity(); } catch { /* Entity may be unloading. */ }
			if (message) flight.player.sendMessage(message);
		}
	} catch { /* ignore disconnect or dimension unload */ }
}

function showCountdownTitle(player, number) {
	try {
		player.onScreenDisplay.setTitle(String(number), {
			fadeInDuration: 0,
			stayDuration: 20,
			fadeOutDuration: 0,
		});
	} catch { /* player may have disconnected while the countdown updated */ }
}

function clearCountdownTitle(player) {
	try { player.onScreenDisplay.setTitle(""); }
	catch { /* player may have disconnected while the title cleared */ }
}

function isJumpHeld(player) {
	try { return player.inputInfo.getButtonState(InputButton.Jump) === ButtonState.Pressed; }
	catch { return false; }
}

function shakeCamera(player, intensity, duration) {
	try { player.camera.addShake({ intensity, duration, type: CameraShakeType.Positional }); }
	catch { /* player may have left or disabled camera shake */ }
}

