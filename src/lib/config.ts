export type DeployMode = "cloud" | "self-hosted";

export function getDeployMode(): DeployMode {
  const mode = process.env.DEPLOY_MODE;
  if (mode === "self-hosted") return "self-hosted";
  return "cloud";
}

export function isSelfHosted(): boolean {
  return getDeployMode() === "self-hosted";
}

export function isCloud(): boolean {
  return getDeployMode() === "cloud";
}

export const features = {
  get websocketSync() {
    return isSelfHosted();
  },
  get oauthAuth() {
    return isCloud();
  },
  get credentialsAuth() {
    return isSelfHosted();
  },
  get builtInScheduler() {
    return isSelfHosted();
  },
} as const;
