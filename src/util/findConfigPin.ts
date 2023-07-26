import fs from "fs";
import path from "path";

export function findConfigPin(): string | null {
  let currentDir = __dirname;

  while (currentDir !== "/") {
    const configPath = path.join(currentDir, "config.json");

    if (fs.existsSync(configPath)) {
      const configFile = fs.readFileSync(configPath, "utf8");
      const config = JSON.parse(configFile);

      if (config.bridge && config.bridge.pin) {
        return config.bridge.pin;
      }
    }

    // Go up one directory level
    currentDir = path.dirname(currentDir);
  }

  // If no config.json was found in any parent directory, return null
  return null;
}
