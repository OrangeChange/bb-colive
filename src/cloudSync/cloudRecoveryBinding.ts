export const CLOUD_RECOVERY_API_VERSION = 2 as const;
export const CLOUD_RECOVERY_PROTOCOL_VERSION = '0.1.3' as const;
export const CLOUD_RECOVERY_CONTRACT_VERSION = '0.3' as const;
export const CLOUD_RECOVERY_SERIALIZATION_VERSION = 'bb-json-utf8-v1' as const;

export interface CloudRecoveryCompatibility {
  serverId: string;
  serviceVersion: string;
  apiVersion: number;
  protocolVersion: string;
  recoveryContractVersion: string;
  serializationVersion: string;
}

export interface CloudRecoveryBinding extends CloudRecoveryCompatibility {
  bindingId: string;
  baseUrl: string;
  verifiedAt: number;
}

export type CloudRecoveryBindingState =
  | { status: 'unbound'; binding: null }
  | { status: 'credential-required'; binding: CloudRecoveryBinding }
  | { status: 'ready'; binding: CloudRecoveryBinding };

export type CloudRecoveryInvoke = <T>(
  command: string,
  args: Record<string, unknown>,
) => Promise<T>;

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function assertCloudRecoveryCompatibility(
  value: CloudRecoveryCompatibility,
): CloudRecoveryCompatibility {
  if (!value || !nonempty(value.serverId) || !nonempty(value.serviceVersion)) {
    throw new Error('invalid_recovery_info');
  }
  if (value.apiVersion !== CLOUD_RECOVERY_API_VERSION) {
    throw new Error('incompatible_apiVersion');
  }
  if (value.protocolVersion !== CLOUD_RECOVERY_PROTOCOL_VERSION) {
    throw new Error('incompatible_protocolVersion');
  }
  if (value.recoveryContractVersion !== CLOUD_RECOVERY_CONTRACT_VERSION) {
    throw new Error('incompatible_recoveryContractVersion');
  }
  if (value.serializationVersion !== CLOUD_RECOVERY_SERIALIZATION_VERSION) {
    throw new Error('incompatible_serializationVersion');
  }
  return value;
}

function assertBindingState(value: CloudRecoveryBindingState): CloudRecoveryBindingState {
  if (value.status === 'unbound') {
    if (value.binding !== null) throw new Error('invalid_binding_state');
    return value;
  }
  if (!value.binding) throw new Error('invalid_binding_state');
  assertCloudRecoveryCompatibility(value.binding);
  return value;
}

export function createCloudRecoveryBindingClient(invoke?: CloudRecoveryInvoke) {
  const call: CloudRecoveryInvoke = invoke ?? (async (command, args) => {
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
    return tauriInvoke(command, args);
  });

  return {
    async load(): Promise<CloudRecoveryBindingState> {
      return assertBindingState(await call('load_cloud_recovery_binding', {}));
    },
    async save(baseUrl: string, token: string): Promise<CloudRecoveryBindingState> {
      return assertBindingState(await call('save_cloud_recovery_binding', { baseUrl, token }));
    },
    async remove(): Promise<void> {
      await call('remove_cloud_recovery_binding', {});
    },
  };
}

