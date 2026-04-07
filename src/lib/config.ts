export type DeployMode = "cloud" | "self-hosted" | "home-assistant";

export function getDeployMode(): DeployMode {
  const mode = process.env.DEPLOY_MODE;
  if (mode === "home-assistant") return "home-assistant";
  if (mode === "self-hosted") return "self-hosted";
  return "cloud";
}

export function isSelfHosted(): boolean {
  return getDeployMode() === "self-hosted" || getDeployMode() === "home-assistant";
}

export function isCloud(): boolean {
  return getDeployMode() === "cloud";
}

export function isHomeAssistant(): boolean {
  return getDeployMode() === "home-assistant";
}

export const features = {
  /** Real-time state sync via HA WebSocket API */
  get continuousSync() {
    return isHomeAssistant();
  },
  /** Legacy REST-based WebSocket sync (self-hosted only, not HA add-on) */
  get websocketSync() {
    return isSelfHosted();
  },
  get oauthAuth() {
    return isCloud();
  },
  get credentialsAuth() {
    return isSelfHosted() && !isHomeAssistant();
  },
  /** Skip SmartHass auth — trust HA Supervisor/Ingress */
  get skipAuth() {
    return isHomeAssistant();
  },
  /** Use Supervisor token for HA API access */
  get supervisorAuth() {
    return isHomeAssistant();
  },
  get builtInScheduler() {
    return isSelfHosted();
  },
} as const;
