// Stub de HSM. En desarrollo guarda claves cifradas en disco bajo HSM_KEYSTORE_PATH.
// En producción se sustituye por integración PKCS#11 con un HSM (CloudHSM, Luna, etc.).
//
// La firma de transacciones Fabric en nombre de un inversor se hace pidiendo al HSM
// que firme el TX hash con la clave correspondiente al enrollmentRef del inversor.

export interface HsmBackend {
  signWithInvestorKey(enrollmentRef: string, payload: Uint8Array): Promise<Uint8Array>;
}

class FileHsm implements HsmBackend {
  async signWithInvestorKey(_enrollmentRef: string, _payload: Uint8Array): Promise<Uint8Array> {
    throw new Error('FileHsm.signWithInvestorKey: implementar carga de clave desde disco y firma ECDSA P-256');
  }
}

export function getHsm(): HsmBackend {
  switch (process.env.HSM_BACKEND ?? 'file') {
    case 'file': return new FileHsm();
    default: throw new Error(`unsupported HSM_BACKEND=${process.env.HSM_BACKEND}`);
  }
}
