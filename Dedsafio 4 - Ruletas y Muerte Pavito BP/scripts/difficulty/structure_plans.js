// Pure structure blueprints: no commands, world access or automatic terrain replacement.
export const STRUCTURE_TYPES = {
    quiu: "Centro de Quiu (cuevas, acuario, sabana y asentamiento)",
    phora: "Cubo Phora", settlement: "Asentamiento Reptisaurio",
    qumara: "Guarida de Qumara", mountain: "Montaña protegida por Eón",
    towers: "Torres del Limbo"
};

export function createStructurePlan(kind, origin) {
    if (!STRUCTURE_TYPES[kind]) throw new Error("Estructura desconocida");
    const operations = [], zones = [], loot = [];
    const fill = (x,y,z,X,Y,Z,block) => operations.push({
        min:{x:origin.x+Math.min(x,X),y:origin.y+Math.min(y,Y),z:origin.z+Math.min(z,Z)},
        max:{x:origin.x+Math.max(x,X),y:origin.y+Math.max(y,Y),z:origin.z+Math.max(z,Z)},
        block:block.includes(":") ? block : "minecraft:"+block
    });
    const zone = (key,x,y,z,radius,minY,maxY) => zones.push({key,x:origin.x+x,y:origin.y+y,z:origin.z+z,
        radius,minY:origin.y+minY,maxY:origin.y+maxY});
    const chest = (x,y,z,items) => {
        fill(x,y,z,x,y,z,"chest");
        loot.push({location:{x:origin.x+x,y:origin.y+y,z:origin.z+z},items});
    };
    const shell = (x,y,z,rx,h,rz,block) => {
        fill(x-rx,y,z-rz,x+rx,y,z+rz,block);
        fill(x-rx,y+h,z-rz,x+rx,y+h,z+rz,block);
        fill(x-rx,y+1,z-rz,x-rx,y+h-1,z+rz,block);
        fill(x+rx,y+1,z-rz,x+rx,y+h-1,z+rz,block);
        fill(x-rx+1,y+1,z-rz,x+rx-1,y+h-1,z-rz,block);
        fill(x-rx+1,y+1,z+rz,x+rx-1,y+h-1,z+rz,block);
    };
    const cube = (x,y,z) => {
        shell(x,y,z,8,16,8,"polished_blackstone_bricks");
        for (const side of [-8,8]) {
            fill(x+side,y+2,z-6,x+side,y+14,z-6,"magma");
            fill(x+side,y+8,z-6,x+side,y+8,z+6,"shroomlight");
            fill(x-6,y+2,z+side,x-6,y+14,z+side,"magma");
        }
        fill(x-2,y+1,z-8,x+2,y+4,z-8,"air");
        fill(x-2,y+1,z-2,x+2,y+2,z+2,"crying_obsidian");
        fill(x,y+3,z,x,y+6,z,"sea_lantern");
        chest(x-5,y+1,z+5,[["minecraft:gold_ingot",8],["minecraft:diamond",2]]);
        zone("phora",x,y+1,z,12,y,y+20);
    };
    const hut = (x,y,z) => {
        shell(x,y,z,4,5,4,"mud_bricks");
        fill(x-1,y+1,z-4,x+1,y+3,z-4,"air");
        for (const side of [-4,4]) fill(x+side,y+1,z-4,x+side,y+6,z-4,"stripped_jungle_log");
        fill(x-5,y+6,z-5,x+5,y+6,z+5,"moss_block");
        fill(x,y+4,z,x,y+4,z,"lantern");
        chest(x+2,y+1,z+2,[["minecraft:arrow",12],["minecraft:cooked_beef",3]]);
    };
    const settlement = (x,y,z) => {
        fill(x-18,y,z-18,x+18,y,z+18,"moss_block");
        for (const [dx,dz] of [[-10,-9],[10,-9],[-10,10],[10,10]]) hut(x+dx,y,z+dz);
        fill(x-2,y+1,z-2,x+2,y+1,z+2,"stone_bricks");
        fill(x,y+2,z,x,y+2,z,"campfire");
        zone("settlement",x,y+1,z,24,y,y+10);
    };
    const lair = (x,y,z,r=18) => {
        shell(x,y,z,r,14,r,"deepslate");
        fill(x-r+1,y+1,z-r+1,x+r-1,y+1,z+r-1,"moss_block");
        fill(x-2,y+2,z-r,x+2,y+6,z-r,"air");
        for (let dx=-r+4;dx<r;dx+=7) for (const dz of [-r+4,r-4]) {
            fill(x+dx,y+2,z+dz,x+dx+1,y+10,z+dz+1,"sculk");
            fill(x+dx,y+11,z+dz,x+dx+1,y+11,z+dz+1,"shroomlight");
        }
        fill(x-4,y+2,z-4,x+4,y+2,z+4,"bone_block");
        chest(x,y+3,z+2,[["minecraft:netherite_scrap",1],["minecraft:amethyst_shard",6]]);
        zone("qumara",x,y+3,z,r+2,y,y+16);
    };
    if (kind === "quiu") {
        // Two traversable levels: enclosed caverns below and savanna above.
        shell(0,0,0,48,20,48,"stone");
        fill(-47,1,-47,47,1,47,"moss_block");
        fill(-48,21,-48,48,22,48,"dirt");
        fill(-48,23,-48,48,23,48,"moss_block");
        fill(-45,1,-34,-18,1,30,"clay");
        fill(-46,2,-35,-17,4,-35,"stone_bricks");
        fill(-46,2,31,-17,4,31,"stone_bricks");
        fill(-46,2,-34,-46,4,30,"stone_bricks");
        fill(-17,2,-34,-17,4,30,"stone_bricks");
        fill(-45,2,-34,-18,4,30,"water");
        for (const x of [-10,10,33]) for (const z of [-34,-12,12,34]) {
            fill(x-1,2,z-1,x+1,19,z+1,"dripstone_block");
            fill(x,17,z,x,17,z,"glowstone");
        }
        // Open south entrance and a walkable staircase to the surface.
        fill(-5,2,-48,5,8,-48,"air");
        fill(-3,20,-43,3,23,-20,"air");
        for (let step=0;step<23;step++) fill(-2,2,-43+step,2,2+step,-43+step,"stone_bricks");
        settlement(24,23,24);
        lair(24,1,-23,17);
        cube(22,23,-26);
        for (const [x,z] of [[-37,-32],[-22,-26],[-33,-8],[-22,8],[-37,24],[-17,35]]) {
            fill(x,24,z,x,29,z,"acacia_log");
            fill(x-3,30,z-3,x+3,30,z+3,"moss_block");
            fill(x-2,31,z-2,x+2,31,z+2,"moss_block");
        }
        zone("quiu",0,24,0,70,0,70);
        zone("quiu_savanna",-28,24,0,25,23,60);
    } else if (kind === "phora") cube(0,0,0);
    else if (kind === "settlement") settlement(0,0,0);
    else if (kind === "qumara") lair(0,0,0);
    else if (kind === "mountain") {
        for (let level=0;level<40;level++) {
            const r=48-level;
            fill(-r,level,-r,r,level,r,level%5===0?"moss_block":"stone");
            // A one-block-rise stair strip winds up the south face.
            fill(-2,level,-r,2,level,-r,"stone_bricks");
        }
        fill(-9,40,-9,9,40,9,"quartz_block");
        for (const x of [-7,7]) for (const z of [-7,7]) {
            fill(x,41,z,x,47,z,"quartz_pillar");
            fill(x,48,z,x,48,z,"sea_lantern");
        }
        fill(-8,49,-8,8,49,8,"amethyst_block");
        fill(0,41,0,0,43,0,"sea_lantern");
        chest(4,41,4,[["minecraft:golden_apple",2],["minecraft:bread",8]]);
        zone("mountain",0,41,0,70,-64,512);
    } else if (kind === "towers") {
        fill(-30,0,-30,30,1,30,"polished_blackstone_bricks");
        for (const [x,z] of [[-20,-20],[20,-20],[-20,20],[20,20]]) {
            shell(x,2,z,6,34,6,"deepslate_bricks");
            fill(x-1,3,z-6,x+1,6,z-6,"air");
            for (let y=9;y<32;y+=7) {
                fill(x-5,y,z-5,x+5,y,z+5,"polished_blackstone_bricks");
                fill(x-2,y+1,z-6,x+2,y+3,z-6,"iron_bars");
            }
            // Spiral staircase: a clear outer ring through every intermediate floor.
            for (const side of [-5,5]) {
                fill(x+side,3,z-5,x+side,35,z+5,"air");
                fill(x-5,3,z+side,x+5,35,z+side,"air");
            }
            const ring=[];
            for(let i=-5;i<5;i++)ring.push([i,-5]);
            for(let i=-5;i<5;i++)ring.push([5,i]);
            for(let i=5;i>-5;i--)ring.push([i,5]);
            for(let i=5;i>-5;i--)ring.push([-5,i]);
            for (let s=0;s<29;s++) {
                const [dx,dz]=ring[s];
                fill(x+dx,3+s,z+dz,x+dx,3+s,z+dz,"stone_bricks");
            }
            for (const dx of [-6,6]) fill(x+dx,37,z,x+dx,37,z,"soul_lantern");
            for (const side of [-6,6]) {
                fill(x+side,17,z-1,x+side,20,z+1,"air");
                fill(x-1,17,z+side,x+1,20,z+side,"air");
            }
            chest(x+3,31,z+3,[["minecraft:golden_apple",1],["minecraft:gold_ingot",4]]);
        }
        for (const side of [-20,20]) {
            fill(-14,16,side-1,14,16,side+1,"deepslate_tiles");
            fill(side-1,16,-14,side+1,16,14,"deepslate_tiles");
        }
        zone("towers",0,2,0,44,0,40);
    }
    const bounds={min:{x:Infinity,y:Infinity,z:Infinity},max:{x:-Infinity,y:-Infinity,z:-Infinity}};
    for (const op of operations) for (const axis of ["x","y","z"]) {
        bounds.min[axis]=Math.min(bounds.min[axis],op.min[axis]);
        bounds.max[axis]=Math.max(bounds.max[axis],op.max[axis]);
    }
    return {kind,origin,operations,zones,loot,bounds};
}

// Each command/query processes at most 4096 blocks, even for large regional floors.
export function* splitVolume(min,max) {
    for(let x=min.x;x<=max.x;x+=16) for(let y=min.y;y<=max.y;y+=16) for(let z=min.z;z<=max.z;z+=16)
        yield {min:{x,y,z},max:{x:Math.min(x+15,max.x),y:Math.min(y+15,max.y),z:Math.min(z+15,max.z)}};
}
