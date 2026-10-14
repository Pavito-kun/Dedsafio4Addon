import { BY_KEY } from "./catalog.js";
import { isDifficultyChangeActive } from "../difficulty_changes.js";
export const active = key => isDifficultyChangeActive(BY_KEY.get(key)?.id);
export const ownerTag = key => "pavi:day_" + key;
