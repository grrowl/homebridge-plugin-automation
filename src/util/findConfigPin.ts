import fs from "fs";
import path from "path";

export function findConfigPin(homebridgeAPI): string | null {
  // Try to get the config from Homebridge's config path first
  const userConfigPath = homebridgeAPI.user.configPath();

  if (fs.existsSync(userConfigPath)) {
    const pin = getPinFromConfigFile(userConfigPath);
    if (pin) return pin;
  }

  // If the pin was not found, walk up the directories from __dirname
  let currentDir = __dirname;

  while (currentDir !== "/") {
    const configPath = path.join(currentDir, "config.json");

    if (fs.existsSync(configPath)) {
      const pin = getPinFromConfigFile(configPath);
      if (pin) return pin;
    }

    // Go up one directory level
    currentDir = path.dirname(currentDir);
  }

  // If no config.json was found in any parent directory, return null
  return null;
}

function getPinFromConfigFile(configPath: string): string | null {
  const configFile = fs.readFileSync(configPath, "utf8");
  const config = JSON.parse(configFile);

  if (config.bridge && config.bridge.pin) {
    return config.bridge.pin;
  }

  return null;
}
