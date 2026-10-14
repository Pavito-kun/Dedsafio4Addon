// Pure rules: later tiers replace earlier tiers, rather than stacking accidentally.
export function adjustedDamage(damage,cause,attacker,on) {
    if (["fire","fireTick","lava"].includes(cause)) damage *= on("fire_x10") ? 10 : on("fire_x3") ? 3 : 1;
    if (cause==="fall" && on("fall_x2")) damage*=2;
    if (cause==="drowning" && on("drowning")) damage*=10;
    if (attacker==="minecraft:endermite" && on("endermite_damage")) damage=100;
    if (attacker==="minecraft:enderman" && on("enderman_damage")) damage=100;
    if (["pavi:pod_phora","pavi:skiff_phora"].includes(attacker) && on("phora_damage")) damage*=4;
    if (attacker?.startsWith("pavi:dromoraptor_") && on("raptor_cherry")) damage+=7;
    if (attacker==="pavi:kragtop" && on("kragtops")) damage*=3;
    return damage;
}
export function expiryDay(nowMilliseconds) { return Math.floor(nowMilliseconds / 86400000); }
export function zombieTool(on) { return on("zombie_mining") ? "minecraft:diamond_pickaxe" : on("zombie_swords") ? "minecraft:iron_sword" : undefined; }
export function spiderStrength(on) { return on("spider_strength_4") ? 3 : on("spider_strength_3") ? 2 : -1; }
